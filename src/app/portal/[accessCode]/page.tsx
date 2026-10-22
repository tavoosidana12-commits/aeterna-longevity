import Link from "next/link";
import Image from "next/image";
import { getPatient, latestPanel } from "@/lib/store";
import { analyze } from "@/lib/analysis";
import { ageGaugeSVG, paceDialSVG, statusBarsSVG, hugoAgesCompareSVG } from "@/lib/charts";

export const dynamic="force-dynamic";

export default async function PortalPage({params}:{params:{accessCode:string}}){
 const code=decodeURIComponent(params.accessCode);
 const patient=await getPatient(code);
 if(!patient) return <div className="shell"><div className="panel error">گزارشی با این کد یافت نشد.</div></div>;
 const panel=await latestPanel(code);
 // Patient view intentionally excludes private clinician notes and never renders AI prescription content.
 const portalData = { ...(panel?.data ?? {}) };
 delete portalData.__doctorNotes;
 const a=analyze(portalData);
 return (<div className="shell">
  <div className="topbar"><div><div className="brand">AETERNA</div><div className="muted">گزارش شخصی طول عمر</div></div><span className="badge">کد: {code}</span></div>
  <div className="panel"><h2>{patient.fullName}</h2><p className="muted">سن تقویمی {a.chronologicalAge??"—"} سال · وضعیت کلی {a.overallScore}/100</p></div>
  <div className="grid cards" style={{marginTop:18}}>
   <div className="panel" dangerouslySetInnerHTML={{__html:ageGaugeSVG(a.biologicalAge,a.chronologicalAge)}}/>
   <div className="panel" dangerouslySetInnerHTML={{__html:paceDialSVG(a.dunedinPace)}}/>
  </div>
  <div className="grid cards" style={{marginTop:18}}>
   {a.categories.map(c=><div className="panel" key={c.category}><strong>{c.category}</strong><p className="muted">{c.status==="optimal"?"عالی":c.status==="good"?"خوب":c.status==="warning"?"هشدار":"ریسک"} — {Math.round(c.score)}/100</p></div>)}
  </div>
  <div className="panel" style={{marginTop:18}} dangerouslySetInnerHTML={{__html:statusBarsSVG(a.categories)}}/>
  <div className="panel" style={{marginTop:18}} dangerouslySetInnerHTML={{__html:hugoAgesCompareSVG(a.biologicalAge,a.chronologicalAge)}}/>
  <h3 className="section-title">جدول نشانگرها</h3>
  <div className="table-wrap panel"><table className="data-table"><thead><tr><th>نشانگر</th><th>مقدار</th><th>واحد</th><th>محدوده</th></tr></thead><tbody>{a.biomarkers.filter(b=>b.value!==null).map(b=><tr key={b.key}><td>{b.label}</td><td>{b.value}</td><td>{b.unit}</td><td className="muted">{b.min??"—"} – {b.max??"—"}</td></tr>)}</tbody></table></div>
  {a.homoIR!==null&&<p className="panel quote">HOMA-IR: {a.homoIR} · اختلاف سن: {a.ageGap??"—"} سال</p>}
  <div className="panel" style={{marginTop:18,borderColor:"#d4af37"}} role="note" aria-label="اطلاعیه پروتکل‌های درمانی">
    <strong>اطلاعیه مهم درباره پروتکل‌های حرفه‌ای</strong>
    <p className="muted" style={{marginBottom:0}}>هرگونه مکمل، دارو یا پروتکل درمانی صرفاً پس از بررسی پرونده و تأیید پزشک معالج ارائه می‌شود. این پورتال نسخه، دوز یا توصیه دارویی هوش مصنوعی را نمایش نمی‌دهد؛ لطفاً برای برنامه شخصی‌سازی‌شده با پزشک خود مشورت کنید.</p>
  </div>
  <div style={{marginTop:24,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}><Image className="qr" src={`/api/qr/${code}`} alt="QR گزارش" width={110} height={110} unoptimized/><Link className="btn" href={`/print/${code}`}>نسخه پرینت لوکس</Link></div>
  <p className="footer">© AETERNA Personalized Longevity</p>
 </div>);
}
