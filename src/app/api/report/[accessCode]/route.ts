import { NextResponse } from "next/server";
import { getPatient, latestPanel } from "@/lib/store";
import { analyze } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { accessCode: string } }
): Promise<NextResponse> {
  const accessCode = decodeURIComponent(params.accessCode).trim();
  const patient = await getPatient(accessCode);
  if (!patient) {
    return NextResponse.json({ ok: false, error: "گزارشی با این کد یافت نشد." }, { status: 404 });
  }
  const panel = await latestPanel(accessCode);
  const analysis = analyze(panel?.data ?? {});
  return NextResponse.json({ ok: true, patient, panel, analysis });
}
