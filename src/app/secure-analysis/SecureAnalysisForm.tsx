"use client";

import { useFormState, useFormStatus } from "react-dom";
import { initialAnalysisState, secureAnalysis } from "@/app/actions/secure-analysis";
import GroundedResultView from "./GroundedResultView";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? "در حال تحلیل مستند..." : "تحلیل مستند"}
    </button>
  );
}

export default function SecureAnalysisForm() {
  const [state, formAction] = useFormState(secureAnalysis, initialAnalysisState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label htmlFor="visitId" className="mb-1 block text-sm font-semibold">
            شناسه مراجعه (UUID)
          </label>
          <input
            id="visitId"
            name="visitId"
            required
            dir="ltr"
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label htmlFor="query" className="mb-1 block text-sm font-semibold">
            پرسش بالینی
          </label>
          <textarea
            id="query"
            name="query"
            required
            rows={4}
            placeholder="مثلاً: توصیه‌های مراقبتی پس از عمل برای این بیمار چیست؟"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-semibold">
            دسته‌بندی (اختیاری)
          </label>
          <input
            id="category"
            name="category"
            placeholder="مثلاً: post-op-care"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
        </div>

        <SubmitButton />
      </form>

      <GroundedResultView state={state} />
    </div>
  );
}
