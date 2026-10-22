"use server";

import { revalidatePath } from "next/cache";
import { addPanel, genAccessCode, getPatient, upsertPatient, type PanelEntry } from "@/lib/store";

export type SaveState = { ok: boolean; message: string; accessCode?: string };

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function saveLabEntry(_prev: SaveState, formData: FormData): Promise<SaveState> {
  try {
    let accessCode = s(formData.get("accessCode"));
    const firstName = s(formData.get("firstName"));
    const lastName = s(formData.get("lastName"));
    const age = Number(s(formData.get("chronologicalAge")));
    if (!accessCode && (!firstName || !lastName))
      return { ok: false, message: "برای بیمار جدید، نام و نام خانوادگی الزامی است." };
    if (!Number.isFinite(age) || age <= 0)
      return { ok: false, message: "سن تقویمی معتبر وارد کنید." };

    let fullName = `${firstName} ${lastName}`.trim();
    const existing = accessCode ? await getPatient(accessCode) : null;
    if (existing) {
      if (!fullName || fullName === " ") fullName = existing.fullName;
      accessCode = existing.accessCode;
    } else {
      accessCode = accessCode || genAccessCode();
    }

    const keys = [
      "nationalId","phone","gender","fastingGlucose","fastingInsulin","hba1c","totalCholesterol",
      "ldlC","hdlC","triglycerides","apoB","lpA","hsCRP","nadLevel","glutathione","homocysteine",
      "cortisol","dheaS","vo2Max","biologicalAge","dunedinPACE","apoE","mthfr","foxo3a","sirt1",
    ];
    const data: Record<string, string> = { chronologicalAge: String(age) };
    for (const k of keys) {
      const v = s(formData.get(k));
      if (v !== "") data[k] = v;
    }
    const doctorNotes = s(formData.get("doctorNotes"));
    if (doctorNotes) data.__doctorNotes = doctorNotes;
    const birthDate = s(formData.get("birthDate"));
    if (birthDate) data.birthDate = birthDate;
    const visitDate = s(formData.get("visitDate"));
    data.visitDate = visitDate || new Date().toISOString().slice(0, 10);

    await upsertPatient({
      accessCode, fullName, nationalId: data.nationalId, phone: data.phone,
      age, sex: data.gender, notes: doctorNotes, createdAt: new Date().toISOString(),
    });

    const entry: PanelEntry = {
      id: `${accessCode}-${Date.now()}`, accessCode, createdAt: new Date().toISOString(), data,
    };
    await addPanel(entry);

    revalidatePath("/admin");
    revalidatePath(`/portal/${accessCode}`);
    return { ok: true, message: `با موفقیت ذخیره شد. کد اختصاصی بیمار: ${accessCode}`, accessCode };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "خطای ناشناخته" };
  }
}
