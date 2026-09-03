import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The intake form is filled in by the parents, so this endpoint takes no
// session. Nothing needs configuring: a submission is only accepted if it
// carries the token from a link that was actually issued, and the case comes
// from that link rather than from the browser.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const party = (s: string) => {
  const l = String(s || "").toLowerCase();
  if (/father|dad|husband|respondent/.test(l)) return "Father";
  if (/mother|mom|wife|petitioner/.test(l)) return "Mother";
  return String(s || "Unknown").slice(0, 40);
};

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const token = String(b.token || "").trim();
    if (!token) return NextResponse.json({ error: "Not accepted" }, { status: 401, headers: CORS });

    await ensureSchema();
    const owner = await q(
      "select case_name, active from questionnaires where share_token = $1", [token]);
    if (!owner.length || owner[0].active === false)
      return NextResponse.json({ error: "Not accepted" }, { status: 401, headers: CORS });

    const caseName = String(owner[0].case_name || "").slice(0, 200);

    await q(
      `insert into questionnaire_responses
         (case_name, party, person_name, email, phone, submitted_text, responses, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [caseName, party(b.completed_by || b.party),
       String(b.name || "").slice(0, 200), String(b.email || "").slice(0, 200),
       String(b.phone || "").slice(0, 60), String(b.submitted || "").slice(0, 100),
       String(b.responses || "").slice(0, 500000), JSON.stringify(b)]);

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}
