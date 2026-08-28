import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { buildWhere } from "../../../lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GROUPS: Record<string, string> = {
  case: "coalesce(case_name,'(no case)')", user: "coalesce(user_name,'(unknown)')",
  month: "to_char(entry_date,'YYYY-MM')", firm: "coalesce(firm,'(none)')",
  kind: "coalesce(kind,'(none)')", day: "to_char(entry_date,'YYYY-MM-DD')",
};

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const expr = GROUPS[sp.get("groupBy") || "case"] || GROUPS.case;
    const { sql, params } = buildWhere(sp);
    const rows = await q(`select ${expr} as label, count(*)::int as entries, coalesce(sum(duration),0)::float as hours from time_entries ${sql} group by 1 order by hours desc limit 500`, params);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
