import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Part-finished answers, held against the link rather than the browser, so a
// parent can start on one device and finish on another. No session: the link
// token is the credential, and it only ever reaches its own row.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function known(token: string) {
  if (!token) return false;
  const r = await q("select 1 from questionnaires where share_token = $1 and active", [token]);
  return r.length > 0;
}

export async function GET(req: Request) {
  try {
    await ensureSchema();
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!(await known(token))) return NextResponse.json({ error: "Not accepted" }, { status: 401, headers: CORS });
    const r = await q("select data, saved_at from questionnaire_drafts where token = $1", [token]);
    return NextResponse.json({ ok: true, data: r[0]?.data || null, saved_at: r[0]?.saved_at || null }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const b = await req.json();
    const token = String(b.token || "");
    if (!(await known(token))) return NextResponse.json({ error: "Not accepted" }, { status: 401, headers: CORS });
    const data = JSON.stringify(b.data || {});
    if (data.length > 2_000_000) return NextResponse.json({ error: "Too large" }, { status: 413, headers: CORS });
    await q(
      `insert into questionnaire_drafts (token, data, saved_at) values ($1,$2::jsonb, now())
       on conflict (token) do update set data = excluded.data, saved_at = now()`,
      [token, data]);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}
