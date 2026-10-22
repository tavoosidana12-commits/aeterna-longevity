"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { fetchVisit, logRecommendation, matchKnowledgeBase, type KnowledgeMatch } from "@/lib/db";
import { CHAT_MODEL, embedQuery, getOpenAI } from "@/lib/openai";
import { buildMessages, isRefusal, verifyCitations } from "@/lib/grounding";

/* ------------------------------------------------------------------ */
/*  تنظیمات دروازه ضد توهم                                            */
/* ------------------------------------------------------------------ */

const GROUNDING_THRESHOLD = Number(process.env.GROUNDING_THRESHOLD ?? 0.35);
const TOP_K = 6;
const MAX_CONTEXT_CHARS_PER_SOURCE = 1200;

const InputSchema = z.object({
  visitId: z.string().uuid({ message: "شناسه مراجعه باید UUID معتبر باشد." }),
  query: z.string().trim().min(3, "پرسش کوتاه است.").max(2000),
  category: z.string().trim().max(120).optional(),
});

export type SourceItem = {
  id: string;
  title: string | null;
  source: string | null;
  snippet: string;
  similarity: number;
};

export type AnalysisState = {
  status: "idle" | "grounded" | "not_grounded" | "error";
  message: string;
  answer?: string;
  sources?: SourceItem[];
  cited?: string[];
  maxSimilarity?: number;
  threshold?: number;
  visitId?: string;
  elapsedMs?: number;
};

export const initialAnalysisState: AnalysisState = { status: "idle", message: "" };

/* ------------------------------------------------------------------ */
/*  کمکی‌ها                                                           */
/* ------------------------------------------------------------------ */

function summarizeVisit(visit: Awaited<ReturnType<typeof fetchVisit>>): string {
  if (!visit) return "";
  const payload =
    visit.raw_payload && Object.keys(visit.raw_payload).length > 0
      ? JSON.stringify(visit.raw_payload).slice(0, 1500)
      : "";
  return [
    `شناسه مراجعه: ${visit.id}`,
    visit.patient_name ? `بیمار: ${visit.patient_name}` : "",
    visit.visit_date ? `تاریخ مراجعه: ${visit.visit_date}` : "",
    visit.chief_complaint ? `شکایت اصلی: ${visit.chief_complaint}` : "",
    visit.summary ? `خلاصه بالینی: ${visit.summary}` : "",
    payload ? `داده خام: ${payload}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function safeLog(payload: Parameters<typeof logRecommendation>[0]) {
  try {
    await logRecommendation(payload);
  } catch (error) {
    // لاگ‌گیری نباید پاسخ کاربر را بشکند
    console.error("[ai_recommendations] log failed:", error);
  }
}

/* ------------------------------------------------------------------ */
/*  Server Action اصلی: RAG دامنه‌بسته با دروازه ضد توهم              */
/* ------------------------------------------------------------------ */

export async function secureAnalysis(
  _prev: AnalysisState,
  formData: FormData
): Promise<AnalysisState> {
  const startedAt = Date.now();

  const parsed = InputSchema.safeParse({
    visitId: String(formData.get("visitId") ?? "").trim(),
    query: String(formData.get("query") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues.map((i) => i.message).join(" | "),
    };
  }

  const { visitId, query, category } = parsed.data;

  try {
    /* ۱) واکشی داده بالینی مراجعه از PostgreSQL */
    const visit = await fetchVisit(visitId);
    if (!visit) {
      return {
        status: "error",
        message: "مراجعه‌ای با این شناسه یافت نشد.",
        visitId,
      };
    }

    /* ۲) ساخت embedding پرسش با OpenAI */
    const queryEmbedding = await embedQuery(query);

    /* ۳) جست‌وجو در دانش‌بنیان با تابع SQL به همراه آستانه شباهت */
    const matches = await matchKnowledgeBase({
      queryEmbedding,
      category: category ?? null,
      threshold: GROUNDING_THRESHOLD,
      limit: TOP_K,
    });

    const usable = matches.filter((m) => Number(m.similarity) >= GROUNDING_THRESHOLD);

    /* ۴) دروازه ضد توهم: بدون سند معتبر هیچ پاسخی تولید نمی‌شود */
    if (usable.length === 0) {
      const refusal = "در دانش‌بنیان موجود پاسخی برای این پرسش یافت نشد.";
      await safeLog({
        visitId,
        query,
        category: category ?? null,
        grounded: false,
        refusalReason: `no_match_above_threshold(${GROUNDING_THRESHOLD})`,
        answer: null,
        sources: matches,
        model: CHAT_MODEL,
      });
      return {
        status: "not_grounded",
        message:
          "پاسخ تولید نشد: هیچ سند مرتبطی بالاتر از آستانه شباهت پیدا نشد (ضد توهم فعال شد).",
        answer: refusal,
        sources: [],
        maxSimilarity: 0,
        threshold: GROUNDING_THRESHOLD,
        visitId,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const sources = usable.map((m: KnowledgeMatch, index: number) => ({
      id: `S${index + 1}`,
      title: m.doc_title,
      source: m.doc_source,
      snippet: (m.content ?? "").slice(0, MAX_CONTEXT_CHARS_PER_SOURCE),
      similarity: Number(m.similarity),
    }));

    const maxSimilarity = Math.max(...sources.map((s) => s.similarity));

    /* ۵) فراخوانی چت با دمای ۰٫۰۵ و الزام ارجاع */
    const completion = await getOpenAI().chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.05,
      top_p: 0.9,
      max_tokens: 700,
      messages: buildMessages({
        question: query,
        visitSummary: summarizeVisit(visit),
        sources: sources.map((s) => ({ id: s.id, content: s.snippet })),
      }),
    });

    const rawAnswer = (completion.choices[0]?.message?.content ?? "").trim();
    const citationCheck = verifyCitations(rawAnswer, sources.map((s) => s.id));

    /* ۶) دروازه دوم: پاسخ باید ارجاع داشته باشد و مدل نباید اعلام ندانستن کند */
    if (isRefusal(rawAnswer) || !citationCheck.ok) {
      const reason = isRefusal(rawAnswer) ? "model_refused" : "missing_or_invalid_citation";
      await safeLog({
        visitId,
        query,
        category: category ?? null,
        grounded: false,
        refusalReason: reason,
        answer: rawAnswer || null,
        sources: usable,
        model: CHAT_MODEL,
      });
      return {
        status: "not_grounded",
        message:
          reason === "model_refused"
            ? "مدل اعلام کرد پاسخ در منابع موجود نیست؛ خروجی به عنوان پاسخ معتبر ارائه نشد."
            : "پاسخ تولیدشده فاقد ارجاع معتبر بود و به همین دلیل رد شد (ضد توهم).",
        answer: "در دانش‌بنیان موجود پاسخی برای این پرسش یافت نشد.",
        sources,
        cited: citationCheck.cited,
        maxSimilarity,
        threshold: GROUNDING_THRESHOLD,
        visitId,
        elapsedMs: Date.now() - startedAt,
      };
    }

    /* ۷) ثبت توصیه در aeterna.ai_recommendations */
    await safeLog({
      visitId,
      query,
      category: category ?? null,
      grounded: true,
      refusalReason: null,
      answer: rawAnswer,
      sources: usable,
      model: CHAT_MODEL,
    });

    revalidatePath("/secure-analysis");

    return {
      status: "grounded",
      message: "پاسخ بر پایه منابع معتبر تولید شد.",
      answer: rawAnswer,
      sources,
      cited: citationCheck.cited,
      maxSimilarity,
      threshold: GROUNDING_THRESHOLD,
      visitId,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error("[secureAnalysis] failed:", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? `خطا در پردازش درخواست: ${error.message}`
          : "خطای ناشناخته در پردازش درخواست.",
      visitId,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
