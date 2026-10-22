import "server-only";

/* --------------------------------------------------------------
   لایه داده اترنا: PostgreSQL لیارا + کش درون‌حافظه (Zero-config)
   اگر DATABASE_URL ست نشده باشد یا اتصال شکست بخورد، سیستم
   به‌صورت خودکار به فالبک حافظه‌ای برمی‌گردد و سایت کرش نمی‌کند.
--------------------------------------------------------------- */

export type Patient = {
  accessCode: string;
  fullName: string;
  nationalId?: string;
  phone?: string;
  age: number;
  sex?: string;
  notes?: string;
  createdAt: string;
};

export type PanelEntry = {
  id: string;
  accessCode: string;
  createdAt: string;
  data: Record<string, number | string | null>;
};

type MemDb = { patients: Map<string, Patient>; panels: PanelEntry[] };

declare global {
  // eslint-disable-next-line no-var
  var __aeternaMem: MemDb | undefined;
}

function mem(): MemDb {
  if (!global.__aeternaMem) {
    global.__aeternaMem = { patients: new Map(), panels: [] };
  }
  return global.__aeternaMem;
}

type SqlTagged = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
};

/**
 * اتصال تنبل به PostgreSQL (از طریق src/lib/db.ts).
 * اگر DATABASE_URL ست نشده باشد null برمی‌گردد (حالت دموی حافظه‌ای).
 */
function getSqlOrNull(): SqlTagged | null {
  if (!process.env.DATABASE_URL) return null;
  try {
    // db.ts نیز «server-only» است؛ این ماژول فقط در سرور import می‌شود.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSql } = require("@/lib/db") as { getSql: () => unknown };
    return getSql() as unknown as SqlTagged;
  } catch (e) {
    console.warn("[store] postgres unavailable, falling back to memory:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function dbMode(): "postgres" | "memory" {
  return process.env.DATABASE_URL ? "postgres" : "memory";
}

export function genAccessCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = letters[Math.floor(Math.random() * letters.length)];
  return `AET-${n}-${l}`;
}

/* ---------------- درج (Admin) ---------------- */

export async function upsertPatient(p: Patient): Promise<void> {
  mem().patients.set(p.accessCode, p); // کش حافظه‌ای همیشه به‌روز می‌ماند
  const sql = getSqlOrNull();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO aeterna.patients (access_code, full_name, national_id, phone, age, sex, notes)
      VALUES (${p.accessCode}, ${p.fullName}, ${p.nationalId ?? null}, ${p.phone ?? null}, ${p.age}, ${p.sex ?? null}, ${p.notes ?? null})
      ON CONFLICT (access_code) DO UPDATE SET full_name = EXCLUDED.full_name, national_id = EXCLUDED.national_id,
        phone = EXCLUDED.phone, age = EXCLUDED.age, sex = EXCLUDED.sex, notes = EXCLUDED.notes`;
  } catch (e) {
    console.error("[store] upsertPatient db failed, memory only:", e);
  }
}

export async function addPanel(e: PanelEntry): Promise<void> {
  mem().panels.unshift(e); // کش حافظه‌ای همیشه به‌روز می‌ماند
  if (mem().panels.length > 2000) mem().panels.length = 2000;
  const sql = getSqlOrNull();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO aeterna.lab_panels (access_code, data, notes)
      VALUES (${e.accessCode}, ${JSON.stringify(e.data)}::jsonb, ${String(e.data.__doctorNotes ?? "")})`;
  } catch (err) {
    console.error("[store] addPanel db failed, memory only:", err);
  }
}

/* ---------------- خواندن (Portal / Print / Admin) ---------------- */

function rowToPatient(r: Record<string, unknown>): Patient {
  return {
    accessCode: String(r.access_code),
    fullName: String(r.full_name ?? ""),
    nationalId: (r.national_id as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    age: Number(r.age ?? 0),
    sex: (r.sex as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
  };
}

export async function getPatient(accessCode: string): Promise<Patient | null> {
  const sql = getSqlOrNull();
  if (sql) {
    try {
      const rows = await sql`
        SELECT access_code, full_name, national_id, phone, age, sex, notes, created_at
        FROM aeterna.patients WHERE access_code = ${accessCode} LIMIT 1`;
      if (rows.length) {
        const p = rowToPatient(rows[0]);
        mem().patients.set(accessCode, p); // پر کردن کش
        return p;
      }
      return null;
    } catch (e) {
      console.error("[store] getPatient db failed, using memory:", e);
    }
  }
  return mem().patients.get(accessCode) ?? null;
}

export async function latestPanel(accessCode: string): Promise<PanelEntry | null> {
  const sql = getSqlOrNull();
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, access_code, data, created_at
        FROM aeterna.lab_panels
        WHERE access_code = ${accessCode}
        ORDER BY created_at DESC
        LIMIT 1`;
      if (rows.length) {
        const r = rows[0];
        const e: PanelEntry = {
          id: String(r.id),
          accessCode: String(r.access_code),
          createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
          data: (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as PanelEntry["data"],
        };
        return e;
      }
      return null;
    } catch (e) {
      console.error("[store] latestPanel db failed, using memory:", e);
    }
  }
  return mem().panels.find((p) => p.accessCode === accessCode) ?? null;
}

export async function listPatients(): Promise<Patient[]> {
  const sql = getSqlOrNull();
  if (sql) {
    try {
      const rows = await sql`
        SELECT access_code, full_name, national_id, phone, age, sex, notes, created_at
        FROM aeterna.patients
        ORDER BY created_at DESC
        LIMIT 500`;
      return rows.map(rowToPatient);
    } catch (e) {
      console.error("[store] listPatients db failed, using memory:", e);
    }
  }
  return Array.from(mem().patients.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
}

export function panelValue(panel: PanelEntry | null, key: string): number | null {
  if (!panel) return null;
  const v = panel.data[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}
