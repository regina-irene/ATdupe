import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ cases: [] }, { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const term = (sp.get("q") || "").trim();
    const limit = Math.min(1000, Math.max(1, parseInt(sp.get("limit") || "25", 10)));
    const rows = term
      ? await q(`select name from cases where name ilike $1 order by closed asc, name asc limit ${limit}`, ["%" + term + "%"])
      : await q(`select name from cases order by closed asc, name asc limit ${limit}`);
    return NextResponse.json({ cases: rows.map((r: any) => r.name) });
  } catch (e: any) {
    return NextResponse.json({ cases: [], error: e.message });
  }
}
