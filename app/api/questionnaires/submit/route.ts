import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The intake form lives on another site and is filled in by the parents, so
// this endpoint takes no session. A token in the form stops stray traffic; it
// is not a secret from the people filling the form in.
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
    const want = process.env.FORM_TOKEN;
    if (want && String(b.token || "") !== want)
      return NextResponse.json({ error: "Not accepted" }, { status: 401, headers: CORS });

    const caseName = String(b.case_name || b.case || "").trim();
    if (!caseName) return NextResponse.json({ error: "No case given" }, { status: 400, headers: CORS });

    await ensureSchema();
    await q(
      `insert into questionnaire_responses
         (case_name, party, person_name, email, phone, submitted_text, responses, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [caseName.slice(0, 200), party(b.completed_by || b.party),
       (b.name || "").slice(0, 200), (b.email || "").slice(0, 200), (b.phone || "").slice(0, 60),
       (b.submitted || "").slice(0, 100), String(b.responses || "").slice(0, 500000),
       JSON.stringify(b)]);

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}
