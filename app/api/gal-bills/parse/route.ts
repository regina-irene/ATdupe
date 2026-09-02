import { NextResponse } from "next/server";
import { authorize } from "../../../../lib/auth";
import { parseBill } from "../../../../lib/galbill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const { text } = await req.json();
    if (!text || !String(text).trim()) return NextResponse.json({ error: "Paste the bill text first." }, { status: 400 });
    const parsed = parseBill(String(text));
    if (!Object.keys(parsed.parties).length)
      return NextResponse.json({ error: "No payments or balances found. Make sure the summary at the end of the bill is included." }, { status: 400 });
    return NextResponse.json({ ok: true, parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
