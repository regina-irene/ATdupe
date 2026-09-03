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
    const openOnly = sp.get("all") === "1" ? "" : "and closed = false";
    const rows = term
      // One row per name, open cases only unless asked otherwise: the table
      // carries duplicates and closed matters, which made the suggester noisy.
      ? await q(`select distinct on (lower(name)) name from cases
                  where name is not null and name <> '' and name ilike $1 ${openOnly}
                  order by lower(name), closed asc limit ${limit}`, ["%" + term + "%"])
      : await q(`select distinct on (lower(name)) name from cases
                  where name is not null and name <> '' ${openOnly}
                  order by lower(name), closed asc limit ${limit}`);
    return NextResponse.json({ cases: [...new Set(rows.map((r: any) => String(r.name).trim()))] });
  } catch (e: any) {
    return NextResponse.json({ cases: [], error: e.message });
  }
}
