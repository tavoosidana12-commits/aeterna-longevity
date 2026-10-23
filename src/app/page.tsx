import Link from "next/link";
export default function HomePage(){
 return (
   <div className="shell hero frame">
     <div>
       {/* لوگوی رسمی طلایی با نماد بی‌نهایت/DNA و ستاره زمردی */}
       <div className="hero-mark" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
         <svg width="64" height="64" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
           {/* DNA / Infinity lines in Gold */}
           <path d="M12 36C12 27 19 20 28 20C40 20 48 52 60 52C69 52 76 45 76 36C76 27 69 20 60 20C48 20 40 52 28 52C19 52 12 45 12 36Z" stroke="#D4AF37" strokeWidth="3" fill="none"/>
           <path d="M12 36C12 45 19 52 28 52C40 52 48 20 60 20C69 20 76 27 76 36C76 45 69 52 60 52C48 52 40 20 28 20C19 20 12 27 12 36Z" stroke="#D4AF37" strokeWidth="3" fill="none" opacity="0.4"/>
           {/* Emerald Star on top */}
           <path d="M36 6L38.4 12.6L45 15L38.4 17.4L36 24L33.6 17.4L27 15L33.6 12.6L36 6Z" fill="#10B981"/>
         </svg>
       </div>

       <h1 className="brand">AETERNA</h1>
       <div className="sub">PERSONALIZED LONGEVITY</div>

       {/* حذف متن طولانی توصیفی به درخواست شما */}

       {/* دکمه با متن جدید مدیریت */}
       <Link className="btn" href="/admin" style={{ marginTop: '2rem', display: 'inline-block' }}>
         مدیریت
       </Link>

       {/* متن راهنمای پرتال بیمار */}
       <p className="muted" style={{ marginTop: '2rem' }}>
         داشبورد بیمار: به آدرس <code>/portal/[کد اختصاصی]</code> مراجعه کنید.
       </p>
     </div>
   </div>
 );
}
