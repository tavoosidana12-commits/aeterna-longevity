export type Biomarker = {
  key: string; label: string; unit: string; value: number | null;
  min?: number; max?: number; ideal?: number; category: string; higherIsBetter?: boolean;
};

export type CategoryScore = { category: string; score: number; status: "optimal" | "good" | "warning" | "risk" };

export type PrescriptionItem = { name: string; dosage: string; rationale: string };
export type AIPrescription = {
  morning_supplements: PrescriptionItem[];
  evening_supplements: PrescriptionItem[];
  clinical_rationale: string[];
  admin_confidential: true;
};

export type Analysis = {
  aiPrescription: AIPrescription;
  homoIR: number | null;
  ageGap: number | null;
  biologicalAge: number | null;
  chronologicalAge: number | null;
  dunedinPace: number | null;
  apoE?: string | null;
  riskScores: { inflammatory: number | null; lipid: number | null; metabolic: number | null; mitochondrial: number | null };
  overallScore: number;
  categories: CategoryScore[];
  biomarkers: Biomarker[];
  interpretation: string[];
};

function score(v: number | null, min: number, max: number, higherIsBetter = false): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  let s = ((v - min) / (max - min)) * 100;
  if (higherIsBetter) s = 100 - s;
  return Math.max(0, Math.min(100, Math.round(s * 10) / 10));
}

export function analyze(data: Record<string, unknown>): Analysis {
  const num = (k: string): number | null => {
    const v = data[k];
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "."));
    return Number.isFinite(n) ? n : null;
  };

  const age = num("chronologicalAge");
  const bioAge = num("biologicalAge");
  const glucose = num("fastingGlucose");
  const insulin = num("fastingInsulin");
  const homoIR = glucose !== null && insulin !== null ? Math.round(((glucose * insulin) / 405) * 100) / 100 : null;
  const ageGap = age !== null && bioAge !== null ? Math.round((bioAge - age) * 10) / 10 : null;
  const pace = num("dunedinPACE");

  const hsCRP = num("hsCRP");
  const apoB = num("apoB");
  const ldl = num("ldlC");
  const nad = num("nadLevel");
  const homocysteine = num("homocysteine");
  const glutathione = num("glutathione");
  const vo2 = num("vo2Max");
  const hba1c = num("hba1c");
  const tg = num("triglycerides");
  const hdl = num("hdlC");

  const riskScores = {
    inflammatory: score(hsCRP, 0.3, 5),
    lipid: score(apoB ?? ldl, 60, 160),
    metabolic: score(homoIR ?? hba1c, 1, 5),
    mitochondrial: score(nad ?? glutathione, 20, 80, true),
  };

  const categories: CategoryScore[] = [
    { category: "متابولیک", score: riskScores.metabolic ?? 50, status: "good" },
    { category: "میتوکندری", score: riskScores.mitochondrial ?? 50, status: "good" },
    { category: "لیپیدی", score: riskScores.lipid ?? 50, status: "good" },
    { category: "اپی‌ژنتیک", score: ageGap !== null ? Math.max(0, Math.min(100, 50 - ageGap * 2.5)) : pace !== null ? Math.max(0, Math.min(100, (1.2 - pace) * 125)) : 50, status: "good" },
  ];
  for (const c of categories) {
    c.status = c.score >= 80 ? "optimal" : c.score >= 60 ? "good" : c.score >= 40 ? "warning" : "risk";
  }
  const overall = Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length);

  // Confidential clinician-facing draft only. Suggestions are biomarker-triggered,
  // are not a prescription, and require medication/interactions/contraindication review.
  const morning_supplements: PrescriptionItem[] = [];
  const evening_supplements: PrescriptionItem[] = [];
  const clinical_rationale: string[] = [];
  const mthfr = String(data.mthfr ?? "").toLowerCase();
  const apoe = String(data.apoE ?? "").toLowerCase();
  if (homoIR !== null && homoIR >= 2.5) {
    morning_supplements.push({ name: "مایواینوزیتول (پیش‌نویس بررسی پزشک)", dosage: "۲ گرم خوراکی، روزی یک‌بار همراه صبحانه؛ فقط پس از تأیید پزشک", rationale: `HOMA-IR محاسبه‌شده ${homoIR} است؛ بررسی مقاومت به انسولین و اولویت اصلاح سبک زندگی. شواهد وابسته به زمینه بالینی است.` });
    clinical_rationale.push(`HOMA-IR ${homoIR}: ارزیابی متابولیک/سبک زندگی پیش از تصمیم مکمل؛ دوز پیشنهادی صرفاً برای بازبینی پزشک.`);
  }
  if (nad !== null && nad < 40) {
    morning_supplements.push({ name: "نیکوتینامید ریبوزید (NR؛ پیش‌نویس بررسی پزشک)", dosage: "۲۵۰ میلی‌گرم خوراکی صبحگاهی؛ فقط پس از تأیید پزشک و بررسی داروها", rationale: `NAD+ ثبت‌شده ${nad} است؛ پایین‌تر از آستانه غربالگری داخلی ۴۰. بررسی علت و تکرار/اعتبارسنجی سنجش مقدم است.` });
    clinical_rationale.push(`NAD+ ${nad}: مقدار پایین‌تر از آستانه داخلی این سامانه؛ ارزیابی پزشکی و اعتبار روش سنجش پیش از مداخله.`);
  }
  if (glutathione !== null && glutathione < 6) {
    evening_supplements.push({ name: "N-استیل‌سیستئین (NAC؛ پیش‌نویس بررسی پزشک)", dosage: "۶۰۰ میلی‌گرم خوراکی شبانه؛ فقط پس از تأیید پزشک و بررسی منع مصرف/داروها", rationale: `گلوتاتیون ثبت‌شده ${glutathione} است؛ امکان بررسی حمایت از مسیر گلوتاتیون مطرح است، اما علت‌یابی و ارزیابی ایمنی لازم است.` });
    clinical_rationale.push(`گلوتاتیون ${glutathione}: بررسی وضعیت تغذیه‌ای/بالینی و ایمنی NAC؛ این یافته به‌تنهایی تشخیص یا اندیکاسیون نیست.`);
  }
  if (homocysteine !== null && homocysteine > 10) {
    morning_supplements.push({ name: "ویتامین B12 (فرم/دوز پس از آزمایش؛ پیش‌نویس پزشک)", dosage: "دوز تعیین‌نشده تا بررسی B12، فولات، عملکرد کلیه و علت افزایش؛ خوددرمانی نشود", rationale: `هموسیستئین ${homocysteine} µmol/L؛ بررسی B12، فولات، کلیه، تیروئید و عوامل دارویی پیش از انتخاب مکمل.` });
    clinical_rationale.push(`هموسیستئین ${homocysteine}: علت‌یابی آزمایشگاهی مقدم است؛ دوز B12/فولات بدون نتایج تکمیلی تعیین نمی‌شود.`);
  }
  if (mthfr && mthfr !== "unknown" && mthfr !== "—") {
    clinical_rationale.push(`واریانت MTHFR گزارش‌شده (${String(data.mthfr)}): به‌تنهایی مبنای تجویز نیست؛ نتیجه ژنتیک، فولات/B12 و سابقه بالینی را پزشک بررسی کند.`);
  }
  if (apoe.includes("e4")) {
    clinical_rationale.push(`ApoE ${String(data.apoE)}: تفسیر خطر باید در زمینه بالینی و سابقه خانوادگی انجام شود؛ از استنتاج یا تجویز خودکار مکمل بر اساس ژنوتیپ پرهیز شود.`);
  }
  if (!clinical_rationale.length) clinical_rationale.push("در داده‌های ثبت‌شده محرک اختصاصی برای پیش‌نویس مکمل یافت نشد؛ تصمیم‌گیری صرفاً با پزشک و ارزیابی کامل بالینی.");
  const aiPrescription: AIPrescription = { morning_supplements, evening_supplements, clinical_rationale, admin_confidential: true };

  const interpretation: string[] = [];
  if (ageGap !== null) interpretation.push(ageGap <= 0 ? `سن بیولوژیک شما ${Math.abs(ageGap)} سال جوان‌تر از سن تقویمی است.` : `سن بیولوژیک شما ${ageGap} سال بیشتر از سن تقویمی است.`);
  if (homoIR !== null) interpretation.push(homoIR < 2.5 ? "HOMA-IR در محدوده مطلوب؛ حساسیت انسولینی حفظ شده است." : homoIR < 5 ? "HOMA-IR مرزی؛ توصیه به اصلاح سبک زندگی و کنترل کربوهیدرات." : "HOMA-IR بالا؛ مقاومت به انسولین؛ پیگیری پزشکی لازم است.");
  if (pace !== null) interpretation.push(pace < 0.9 ? "DunedinPACE در محدوده بهینه (زیر ۰٫۹)؛ سرعت پیری کند است." : pace < 1 ? "DunedinPACE نرمال (زیر ۱)؛ اما فرصت بهبود وجود دارد." : "DunedinPACE بالاتر از ۱؛ سرعت پیری تسریع‌شده.");
  if (hsCRP !== null) interpretation.push(hsCRP < 1 ? "hs-CRP پایین؛ التهاب سیستمیک کنترل‌شده است." : hsCRP < 3 ? "hs-CRP متوسط؛ ریسک التهابی متوسط." : "hs-CRP بالا؛ التهاب سیستمیک؛ بررسی لازم است.");
  if (nad !== null) interpretation.push(nad < 40 ? "سطح NAD+ سلولی پایین‌تر از حد مطلوب؛ پشتیبانی میتوکندریایی توصیه می‌شود." : "سطح NAD+ سلولی در محدوده رضایت‌بخش است.");
  const doctorNotes = typeof data.__doctorNotes === "string" ? data.__doctorNotes.trim() : "";
  if (doctorNotes) interpretation.push(`دستور پزشک: ${doctorNotes}`);

  const mk = (key: string, label: string, unit: string, category: string, min?: number, max?: number, higherIsBetter?: boolean): Biomarker =>
    ({ key, label, unit, value: num(key), min, max, category, higherIsBetter });

  const biomarkers: Biomarker[] = [
    mk("chronologicalAge", "سن تقویمی", "سال", "اپی‌ژنتیک"),
    mk("biologicalAge", "سن بیولوژیک", "سال", "اپی‌ژنتیک"),
    mk("dunedinPACE", "نرخ پیری DunedinPACE", "—", "اپی‌ژنتیک", 0.7, 1.3, true),
    mk("fastingGlucose", "گلوکز ناشتا", "mg/dL", "متابولیک", 70, 110),
    mk("fastingInsulin", "انسولین ناشتا", "µIU/mL", "متابولیک", 2, 15),
    mk("hba1c", "هموگلوبین A1c", "%", "متابولیک", 4.5, 6.5),
    mk("triglycerides", "تری‌گلیسرید", "mg/dL", "لیپیدی", 50, 200),
    mk("hdlC", "HDL-C", "mg/dL", "لیپیدی", 30, 90, true),
    mk("ldlC", "LDL-C", "mg/dL", "لیپیدی", 50, 190),
    mk("totalCholesterol", "کلسترول توتال", "mg/dL", "لیپیدی", 120, 240),
    mk("apoB", "ApoB", "mg/dL", "لیپیدی", 50, 130),
    mk("lpA", "Lp(a)", "mg/dL", "لیپیدی", 0, 75),
    mk("hsCRP", "hs-CRP", "mg/L", "التهابی", 0.2, 5),
    mk("nadLevel", "سطح سلولی NAD+", "µmol/L", "میتوکندری", 20, 80, true),
    mk("glutathione", "گلوتاتیون", "µmol/L", "میتوکندری", 4, 10, true),
    mk("homocysteine", "هموسیستئین", "µmol/L", "متابولیک", 5, 15),
    mk("cortisol", "کورتیزول", "µg/dL", "التهابی", 5, 23),
    mk("dheaS", "DHEA-S", "µg/dL", "التهابی", 80, 400, true),
    mk("vo2Max", "VO2 Max", "mL/kg/min", "میتوکندری", 25, 55, true),
  ];

  return { aiPrescription, homoIR, ageGap, biologicalAge: bioAge, chronologicalAge: age, dunedinPace: pace,
    apoE: (data.apoE as string) ?? null, riskScores, overallScore: overall, categories, biomarkers, interpretation };
}
