import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small and cheap: the nav polls this to decide whether to show a badge.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ unread: 0 });
  try {
    await ensureSchema();
    const r = await q("select count(*)::int as n from questionnaire_responses where seen = false");
    return NextResponse.json({ unread: r[0]?.n || 0 });
  } catch {
    return NextResponse.json({ unread: 0 });
  }
}
