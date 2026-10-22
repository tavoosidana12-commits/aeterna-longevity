import Link from "next/link";
import Image from "next/image";
import PrintButton from "./PrintButton";
import { getPatient, latestPanel } from "@/lib/store";
import { analyze } from "@/lib/analysis";
import { ageGaugeSVG, paceDialSVG, statusBarsSVG, hugoAgesCompareSVG } from "@/lib/charts";

export const dynamic="force-dynamic";
const groups:[string,string[]][]=[["بیوشیمی و لیپید",["fastingGlucose","fastingInsulin","hba1c","totalCholesterol","ldlC","hdlC","triglycerides","apoB","lpA"]],["التهابی و میتوکندریایی",["hsCRP","nadLevel","glutathione","homocysteine","cortisol","dheaS","vo2Max"]],["ژنومیک و اپی‌ژنتیک",["chronologicalAge","biologicalAge","dunedinPACE"]]];
const GENETIC=[["apoe","ApoE"],["mthfr","MTHFR"],["foxo3a","FOXO3A"],["sirt1","SIRT1"]] as const;

export default async function PrintPage({params}:{params:{accessCode:string}}){
 const code=decodeURIComponent(params.accessCode);
 const patient=await getPatient(code);
 if(!patient) return <div className="shell"><div className="panel error">یافت نشد.</div></div>;
 const panel=await latestPanel(code);
 const data=panel?.data??{};
 const a=analyze(data);
 return (<div className="shell"><PrintButton/>
 <div className="report-frame">
  <div style={{textAlign:"center"}}><div className="brand" style={{fontSize:34}}>AETERNA</div><div className="muted" style={{letterSpacing:".3em",fontSize:11}}>PERSONALIZED LONGEVITY INSTITUTE</div><h2 style={{color:"#d4af37",margin:"14px 0 4px"}}>گزارش جامع طول عمر</h2><span className="badge">کد اختصاصی: {code}</span></div>
  <div className="panel" style={{marginTop:18}}><strong>{patient.fullName}</strong><p className="muted">سن تقویمی {a.chronologicalAge??"—"} سال · تاریخ گزارش: {panel?.createdAt?.slice(0,10)??"—"}</p></div>
  <div className="grid cards" style={{marginTop:14}}>
   <div className="panel" dangerouslySetInnerHTML={{__html:ageGaugeSVG(a.biologicalAge,a.chronologicalAge)}}/>
   <div className="panel" dangerouslySetInnerHTML={{__html:paceDialSVG(a.dunedinPace)}}/>
   <div className="panel" dangerouslySetInnerHTML={{__html:statusBarsSVG(a.categories)}}/>
   <div className="panel" dangerouslySetInnerHTML={{__html:hugoAgesCompareSVG(a.biologicalAge,a.chronologicalAge)}}/>
  </div>
  {a.homoIR!==null&&<p className="panel quote">HOMA-IR محاسبه‌شده: {a.homoIR} · اختلاف سن بیولوژیک: {a.ageGap??"—"} سال</p>}
  {groups.map(([g,keys])=>{const rows=a.biomarkers.filter(b=>keys.includes(b.key)&&b.value!==null);if(!rows.length)return null;return (<div key={g}><h3 className="section-title">{g}</h3><div className="table-wrap panel"><table className="data-table"><thead><tr><th>نشانگر</th><th>مقدار</th><th>واحد</th><th>محدوده مرجع</th></tr></thead><tbody>{rows.map(b=><tr key={b.key}><td>{b.label}</td><td>{b.value}</td><td>{b.unit}</td><td className="muted">{b.min??"—"} – {b.max??"—"}</td></tr>)}</tbody></table></div></div>);})}
  <h3 className="section-title">پروفایل ژنتیکی</h3>
  <div className="panel">{GENETIC.filter(([k])=>data[k]).map(([k,l])=><span key={k} className="badge" style={{marginInlineEnd:8}}>{l}: {String(data[k])}</span>)}{!GENETIC.some(([k])=>data[k])&&<span className="muted">ثبت نشده</span>}</div>
  <h3 className="section-title">تفسیر بالینی</h3>
  <div className="panel">{a.interpretation.map((t,i)=><p className="quote" key={i} style={{marginBottom:6}}>{t}</p>)}</div>

<h3 className="section-title">نسخه مکمل محرمانه پزشک (فقط حرفه‌ای — تحویل به بیمار نشود)</h3>
<div className="panel" style={{borderColor:"#8a2b2b"}}>
  <p className="muted">این بخش {a.aiPrescription.admin_confidential ? "محرمانه" : ""} است و صرفاً پیش‌نویس هوش مصنوعی بر اساس بیومارکرهاست؛ اجرای هر مورد منوط به تأیید و امضای پزشک معالج است. دوزها، تداخلات و منع‌مصرف‌ها باید بررسی شود.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginTop:10}}>
    <div><strong>صبح (Morning)</strong><ul style={{paddingInlineStart:18,margin:"8px 0 0"}}>{a.aiPrescription.morning_supplements.length?a.aiPrescription.morning_supplements.map((it,i)=><li key={i}><b>{it.name}</b> — دوز: {it.dosage}<br/><span className="muted">مبنای بالینی: {it.rationale}</span></li>):<li className="muted">موردی ثبت نشده</li>}</ul></div>
    <div><strong>شب (Evening)</strong><ul style={{paddingInlineStart:18,margin:"8px 0 0"}}>{a.aiPrescription.evening_supplements.length?a.aiPrescription.evening_supplements.map((it,i)=><li key={i}><b>{it.name}</b> — دوز: {it.dosage}<br/><span className="muted">مبنای بالینی: {it.rationale}</span></li>):<li className="muted">موردی ثبت نشده</li>}</ul></div>
  </div>
  <div style={{marginTop:10}}><strong> rationale بالینی</strong><ul style={{paddingInlineStart:18}}>{a.aiPrescription.clinical_rationale.map((r,i)=><li key={i}>{r}</li>)}</ul></div>
</div>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:30,gap:12,flexWrap:"wrap"}}>
   <div style={{textAlign:"center"}}><Image className="qr" src={`/api/qr/${code}`} alt="QR راستی‌آزمایی" width={110} height={110} unoptimized/><p className="muted" style={{fontSize:11}}>اسکن برای راستی‌آزمایی</p></div>
   <div style={{textAlign:"center"}}><p style={{marginBottom:34}} className="muted">مهر و امضای مؤسسه</p><div style={{borderTop:"1px solid #756125",width:180,margin:"auto"}}/><p className="muted" style={{fontSize:11}}>AETERNA Personalized Longevity Institute</p></div>
  </div>
  <p className="footer">صفحه ۱ از ۱ · سند محرمانه · AETERNA</p>
 </div></div>);
}
