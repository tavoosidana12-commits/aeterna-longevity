"use client";
import { useFormState } from "react-dom";
import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { saveLabEntry, type SaveState } from "@/app/actions/admin";
import { analyze } from "@/lib/analysis";

type PatientOpt = { accessCode: string; fullName: string };

const BIO = ["fastingGlucose","fastingInsulin","hba1c","totalCholesterol","ldlC","hdlC","triglycerides","apoB","lpA","hsCRP","nadLevel","glutathione","homocysteine","cortisol","dheaS","vo2Max","biologicalAge","dunedinPACE"] as const;
const LABELS: Record<string, string> = {fastingGlucose:"گلوکز ناشتا (mg/dL)",fastingInsulin:"انسولین ناشتا (µIU/mL)",hba1c:"هموگلوبین A1c (%)",totalCholesterol:"کلسترول توتال (mg/dL)",ldlC:"LDL-C (mg/dL)",hdlC:"HDL-C (mg/dL)",triglycerides:"تری‌گلیسرید (mg/dL)",apoB:"ApoB (mg/dL)",lpA:"Lp(a) (mg/dL)",hsCRP:"hs-CRP (mg/L)",nadLevel:"NAD+ (µmol/L)",glutathione:"گلوتاتیون (µmol/L)",homocysteine:"هموسیستئین (µmol/L)",cortisol:"کورتیزول (µg/dL)",dheaS:"DHEA-S (µg/dL)",vo2Max:"VO2 Max (mL/kg/min)",biologicalAge:"سن بیولوژیک (سال)",dunedinPACE:"DunedinPACE"};

export default function AdminPage() {
  // React 18 سازگار: useFormState از react-dom (در React 19 به useActionState منتقل شده است)
  const [state, formAction, pending] = useFormState<SaveState, FormData>(saveLabEntry, { ok: false, message: "" });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const prescription = analyze(formValues).aiPrescription;

  // فهرست بیماران از API سمت سرور خوانده می‌شود (بدون import ماژول‌های server-only)
  useEffect(() => {
    fetch("/api/report/patients")
      .then((r) => r.json())
      .then((d) => setPatients(d.patients ?? []))
      .catch(() => {});
  }, []);

  // پیش‌بارگذاری مقادیر فرم هنگام انتخاب بیمار موجود
  useEffect(() => {
    if (mode !== "existing" || !patients.length) return;
    const sel = document.querySelector<HTMLSelectElement>("select[name=accessCode]");
    if (!sel || !sel.value) return;
    const chosen = patients.find((p) => p.accessCode === sel.value);
    if (!chosen) return;
    const form = sel.form;
    if (!form) return;
    startTransition(() => {
      const name = form.elements.namedItem("firstName") as HTMLInputElement | null;
      const last = form.elements.namedItem("lastName") as HTMLInputElement | null;
      if (name) name.value = chosen.fullName.split(" ")[0] ?? "";
      if (last) last.value = chosen.fullName.split(" ").slice(1).join(" ");
    });
  }, [mode, patients]);

  return (<div className="shell"><div className="topbar"><div className="brand">AETERNA · پنل مدیریت</div><Link className="btn ghost" href="/">خانه</Link></div>
  <div className="frame"><form action={formAction} onChange={(event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!target.name) return;
    const value = target.value;
    setFormValues((current) => ({ ...current, [target.name]: target instanceof HTMLInputElement && target.type === "number" && value !== "" ? Number(value) : value }));
  }}>
    <h2 className="section-title">۱) بیمار</h2>
    <div className="grid" style={{gridTemplateColumns:"1fr 1fr",gap:10}}>
      <label className="field"><input type="radio" name="mode" checked={mode==="new"} onChange={()=>setMode("new")} /> بیمار جدید</label>
      <label className="field"><input type="radio" name="mode" checked={mode==="existing"} onChange={()=>setMode("existing")} /> بیمار موجود</label>
    </div>
    {mode==="existing"&&<div className="field"><label>کد اختصاصی موجود</label><select name="accessCode" defaultValue="">{patients.length?patients.map(p=><option key={p.accessCode} value={p.accessCode}>{p.fullName} — {p.accessCode}</option>):<option value="">لیست خالی؛ ابتدا بیمار جدید ثبت کنید</option>}</select></div>}
    <div className="input-grid">
      {mode==="new"&&<div className="field"><label>نام</label><input name="firstName" required/></div>}
      {mode==="new"&&<div className="field"><label>نام خانوادگی</label><input name="lastName" required/></div>}
      {mode==="new"&&<div className="field"><label>کد ملی</label><input name="nationalId"/></div>}
      {mode==="new"&&<div className="field"><label>تاریخ تولد</label><input name="birthDate" type="date"/></div>}
      {mode==="new"&&<div className="field"><label>جنسیت</label><select name="gender"><option value="female">زن</option><option value="male">مرد</option></select></div>}
      {mode==="new"&&<div className="field"><label>تلفن</label><input name="phone"/></div>}
      <div className="field"><label>تاریخ ویزیت</label><input name="visitDate" type="date"/></div>
      <div className="field"><label>سن تقویمی (سال)</label><input name="chronologicalAge" type="number" min={1} max={120} required/></div>
    </div>
    <h2 className="section-title">۲) نشانگرهای زیستی (همه اختیاری)</h2>
    <div className="input-grid">{BIO.map(k=><div className="field" key={k}><label>{LABELS[k]}</label><input name={k} type="number" step="any"/></div>)}</div>
    <div className="input-grid">
      <div className="field"><label>ApoE</label><select name="apoE" defaultValue=""><option value="">—</option>{["e2/e2","e2/e3","e2/e4","e3/e3","e3/e4","e4/e4"].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
      <div className="field"><label>MTHFR</label><input name="mthfr" placeholder="مثلاً C677T"/></div>
      <div className="field"><label>FOXO3A</label><input name="foxo3a"/></div>
      <div className="field"><label>SIRT1</label><input name="sirt1"/></div>
    </div>

<h2 className="section-title">۴) نسخه مکمل محرمانه پزشک</h2>
<div className="panel" style={{borderColor:"#8a2b2b"}}>
  <p className="muted">پیش‌نویس هوش مصنوعی بر اساس مقادیر واردشده؛ محرمانه و صرفاً برای بازبینی پزشک. هیچ مکملی بدون تأیید پزشک معالج و بررسی تداخل/منع مصرف توصیه یا اجرا نشود.</p>
  <div className="input-grid" style={{gridTemplateColumns:"1fr 1fr"}}>
    <div><strong>صبح</strong>{prescription.morning_supplements.length ? prescription.morning_supplements.map((item,i)=><p className="quote" key={i}><b>{item.name}</b><br/>دوز: {item.dosage}<br/><span className="muted">توجیه: {item.rationale}</span></p>) : <p className="muted">بر اساس ورودی فعلی موردی ایجاد نشده.</p>}</div>
    <div><strong>شب</strong>{prescription.evening_supplements.length ? prescription.evening_supplements.map((item,i)=><p className="quote" key={i}><b>{item.name}</b><br/>دوز: {item.dosage}<br/><span className="muted">توجیه: {item.rationale}</span></p>) : <p className="muted">بر اساس ورودی فعلی موردی ایجاد نشده.</p>}</div>
  </div>
  <strong>توجیهات بالینی</strong>{prescription.clinical_rationale.map((text,i)=><p className="muted" key={i}>{text}</p>)}
</div>
    <h2 className="section-title">۳) یادداشت پزشک</h2>
    <div className="field"><textarea name="doctorNotes" placeholder="توصیه‌ها و دستورات پزشک..."/></div>
    <p style={{marginTop:14}}><button className="btn" disabled={pending}>{pending?"در حال ذخیره...":"ذخیره و تولید گزارش"}</button></p>
  </form>
  {state.ok&&<div className="success" style={{marginTop:16}}><p>{state.message}</p><div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}><Link className="btn" href={`/portal/${state.accessCode}`}>همزمان باز کردن گزارش لوکس برای مشتری</Link><Link className="btn ghost" href={`/print/${state.accessCode}`}>نسخه پرینت</Link></div></div>}
  {!state.ok&&state.message&&<p className="error" style={{marginTop:10}}>{state.message}</p>}
  </div></div>);
}
