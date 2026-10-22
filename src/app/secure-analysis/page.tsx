import type { Metadata } from "next";
import SecureAnalysisForm from "./SecureAnalysisForm";

export const metadata: Metadata = {
  title: "تحلیل مستند Aeterna",
  description: "RAG دامنه‌بسته با دروازه ضد توهم برای داده‌های بالینی",
};

export default function SecureAnalysisPage() {
  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">تحلیل مستند بالینی</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          این سامانه فقط بر پایه دانش‌بنیان معتبر پاسخ می‌دهد. اگر سند مرتبطی بالاتر از آستانه
          شباهت پیدا نشود، پاسخ تولید نمی‌شود و خطای «نامستند» نمایش داده می‌شود.
        </p>
      </header>

      <SecureAnalysisForm />

      <footer className="mt-10 text-xs text-slate-400">
        Aeterna Grounded RAG · Next.js 14 · Server Actions
      </footer>
    </main>
  );
}
