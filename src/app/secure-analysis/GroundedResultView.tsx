"use client";

import type { AnalysisState } from "@/app/actions/secure-analysis";

type Props = { state: AnalysisState };

const statusStyles: Record<AnalysisState["status"], string> = {
  idle: "border-slate-200 bg-slate-50 text-slate-600",
  grounded: "border-emerald-300 bg-emerald-50 text-emerald-900",
  not_grounded: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-rose-300 bg-rose-50 text-rose-900",
};

const statusLabel: Record<AnalysisState["status"], string> = {
  idle: "در انتظار درخواست",
  grounded: "پاسخ مستند و معتبر",
  not_grounded: "پاسخ نامستند — رد شد",
  error: "خطا",
};

function score(value?: number) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

export default function GroundedResultView({ state }: Props) {
  if (state.status === "idle") {
    return (
      <div className={`rounded-xl border p-4 text-sm ${statusStyles.idle}`}>
        برای شروع، شناسه مراجعه و پرسش بالینی را وارد کنید.
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`rounded-xl border p-4 ${statusStyles[state.status]}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{statusLabel[state.status]}</span>
          <span className="text-xs opacity-80">
            آستانه شباهت: {score(state.threshold)} | بیشترین شباهت: {score(state.maxSimilarity)}
            {state.elapsedMs ? ` | ${state.elapsedMs}ms` : ""}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6">{state.message}</p>
      </div>

      {state.answer ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-base font-bold">پاسخ سامانه</h2>
          <p className="whitespace-pre-wrap text-sm leading-7">{state.answer}</p>
          {state.cited?.length ? (
            <p className="mt-3 text-xs text-slate-500">
              ارجاع‌های استفاده‌شده: {state.cited.join("، ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {state.sources && state.sources.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-bold">منابع</h2>
          <ol className="space-y-3">
            {state.sources.map((src) => (
              <li key={src.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="font-mono font-bold text-slate-800">[{src.id}]</span>
                  <span>{src.title ?? "بدون عنوان"}</span>
                  <span>شباهت: {src.similarity.toFixed(3)}</span>
                </div>
                {src.source ? (
                  <p className="mt-1 text-xs text-slate-500">منبع: {src.source}</p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{src.snippet}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
