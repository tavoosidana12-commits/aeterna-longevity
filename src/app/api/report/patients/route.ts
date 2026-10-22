import { NextResponse } from "next/server";
import { listPatients } from "@/lib/store";
export const dynamic="force-dynamic";
export async function GET(){const ps=await listPatients();return NextResponse.json({ok:true,patients:ps.map(p=>({accessCode:p.accessCode,fullName:p.fullName}))});}
