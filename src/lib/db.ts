import postgres, { type Sql } from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __aeternaSql: Sql | undefined;
}

function buildOptions() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return {
    // Liara Postgres supports TLS; sslmode=require in the URL is honored,
    // the fallback object keeps local/test setups working.
    ssl: process.env.NODE_ENV === "production" ? "require" : undefined,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  } as const;
}

/**
 * اتصال مشترک (singleton) به PostgreSQL لیارا.
 * در محیط‌های Serverless هر نمونه یک استخر کوچک نگه می‌دارد.
 */
export function getSql(): Sql {
  if (!global.__aeternaSql) {
    global.__aeternaSql = postgres(process.env.DATABASE_URL as string, buildOptions());
  }
  return global.__aeternaSql;
}

export type VisitRecord = {
  id: string;
  patient_name: string | null;
  visit_date: string | null;
  chief_complaint: string | null;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
};

export type KnowledgeMatch = {
  chunk_id: string;
  doc_title: string | null;
  doc_source: string | null;
  content: string;
  similarity: number;
};

/** دریافت داده‌های بالینی مراجعه از دیتابیس */
export async function fetchVisit(visitId: string): Promise<VisitRecord | null> {
  const sql = getSql();
  const rows = await sql<VisitRecord[]>`
    SELECT id,
           patient_name,
           visit_date::text AS visit_date,
           chief_complaint,
           summary,
           row_to_json(v) AS raw_payload
    FROM aeterna.visits v
    WHERE v.id = ${visitId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** فراخوانی تابع جست‌وجوی دانش‌بنیان برداری */
export async function matchKnowledgeBase(args: {
  queryEmbedding: number[];
  category?: string | null;
  threshold: number;
  limit: number;
}): Promise<KnowledgeMatch[]> {
  const sql = getSql();
  const category = args.category ?? null;
  const rows = await sql<KnowledgeMatch[]>`
    SELECT chunk_id,
           doc_title,
           doc_source,
           content,
           similarity
    FROM aeterna.match_knowledge_base(
      ${JSON.stringify(args.queryEmbedding)}::vector,
      ${category},
      ${args.threshold}::float8,
      ${args.limit}::int
    )
  `;
  return rows;
}

/** ثبت توصیه/پاسخ تولیدشده در aeterna.ai_recommendations */
export async function logRecommendation(row: {
  visitId: string;
  query: string;
  category: string | null;
  grounded: boolean;
  refusalReason: string | null;
  answer: string | null;
  sources: KnowledgeMatch[];
  model: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO aeterna.ai_recommendations
      (visit_id, query, category, grounded, refusal_reason, answer, sources, model)
    VALUES (
      ${row.visitId}::uuid,
      ${row.query},
      ${row.category},
      ${row.grounded},
      ${row.refusalReason},
      ${row.answer},
      ${JSON.stringify(row.sources)}::jsonb,
      ${row.model}
    )
  `;
}
