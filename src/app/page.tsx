import Link from "next/link";
export default function HomePage(){
 return (<div className="shell hero frame"><div>
  <div className="hero-mark">⚕</div>
  <h1 className="brand">AETERNA</h1>
  <div className="sub">PERSONALIZED LONGEVITY</div>
  <p>مرکز تخصصی طب طول عمر اترنا؛ تحلیل جامع نشانگرهای خون، اپی‌ژنتیک و میتوکندریایی با هوش مصنوعی دانش‌بنیان، گزارش لوکس قابل پرینت و دسترسی امن مشتری از طریق QR.</p>
  <Link className="btn" href="/admin">فعالی عضوی برای مدیر</Link>
  <p className="muted">داشبورد بیمار: به آدرس <code>/portal/[کد اختصاصی]</code> مراجعه کنید.</p>
 </div></div>);
}
