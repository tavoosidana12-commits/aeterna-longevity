export const GROUNDING_SYSTEM_PROMPT = [
  "تو دستیار بالینیِ دامنه‌بسته برای سامانه Aeterna هستی.",
  "قانون ۱ (سخت): فقط و فقط از متن «منابع» پاسخ بده.",
  "قانون ۲: برای هر ادعا یک شناسه منبع به شکل [S1] یا [S2] درج کن.",
  "قانون ۳: اگر پاسخ در منابع نیست، دقیقاً بنویس:",
  "«در دانش‌بنیان موجود پاسخی برای این پرسش یافت نشد.»",
  "قانون ۴: از حدس‌زدن درباره تشخیص، دارو یا پروسیجر خودداری کن.",
  "قانون ۵: پاسخ را کوتاه، دقیق و ساختاریافته بنویس.",
].join("\n");

/** ساخت پیام‌های چت با کنترل سخت بسته‌بودن دامنه */
export function buildMessages(args: {
  question: string;
  visitSummary: string;
  sources: { id: string; content: string }[];
}) {
  const sourceBlock = args.sources
    .map((s) => `[${s.id}] ${s.content}`)
    .join("\n\n");

  return [
    { role: "system" as const, content: GROUNDING_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [
        "## خلاصه مراجعه",
        args.visitSummary,
        "",
        "## منابع معتبر (تنها منبع مجاز)",
        sourceBlock,
        "",
        "## پرسش",
        args.question,
      ].join("\n"),
    },
  ];
}

const CITATION_RE = /\[S\d+\]/g;

/** بررسی وجود ارجاع در پاسخ و اینکه ارجاع‌ها معتبرند */
export function verifyCitations(answer: string, validIds: string[]): {
  ok: boolean;
  cited: string[];
  unknown: string[];
} {
  const cited = Array.from(new Set(answer.match(CITATION_RE) ?? [])).map((c) =>
    c.slice(1, -1)
  );
  const valid = new Set(validIds);
  const unknown = cited.filter((c) => !valid.has(c));
  return { ok: cited.length > 0 && unknown.length === 0, cited, unknown };
}

/** آیا پاسخ مدل اعتراف به ندانستن کرده است؟ */
export function isRefusal(answer: string): boolean {
  return /یافت نشد|پاسخی برای این پرسش|در دانش‌بنیان موجود|not (found|available) in the knowledge base/i.test(
    answer
  );
}
