"use client";
export default function PrintButton(){
 return (<div className="no-print" style={{marginBottom:14}}>
  <button className="btn" onClick={()=>window.print()}>پرینت کردن گزارش لوکس</button>
  <span className="muted"> — در پنجره چاپ، مقصد Save as PDF یا پرینتر A4 را انتخاب کنید.</span>
 </div>);
}
