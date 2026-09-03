import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marking them read is what clears the badge.
export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    if (Array.isArray(b.ids) && b.ids.length) {
      await q("update questionnaire_responses set seen = true where id = any($1::bigint[])", [b.ids]);
    } else if (b.all) {
      await q("update questionnaire_responses set seen = true where seen = false");
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await q(
      `select id, case_name, party, person_name, email, phone, submitted_text, responses, received_at, seen
         from questionnaire_responses order by lower(case_name), lower(party), received_at desc`);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
