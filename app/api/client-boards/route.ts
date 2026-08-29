import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { tablesIn } from "../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_RE = /^app[A-Za-z0-9]{14}$/;

// Accepts a base id or any airtable.com URL containing one.
function baseIdFrom(input: string): string | null {
  const s = String(input || "").trim();
  if (BASE_RE.test(s)) return s;
  const m = s.match(/app[A-Za-z0-9]{14}/);
  return m ? m[0] : null;
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    // Seed the first board Regina asked for, so the tab is not empty on day one.
    const any = await q("select 1 from client_boards limit 1");
    if (!any.length) {
      await q(
        `insert into client_boards (base_id, label, note) values ($1,$2,$3)
         on conflict (base_id) do nothing`,
        ["apprWGHbkKL7ZoLMK", "Gwinnett 25 A 01537-6", "First client board. Link it to a case, then sync its tables."]);
    }
    const rows = await q(
      `select b.*, (select count(*)::int from mirror_rows m where m.table_key like 'b:' || b.base_id || ':%') as rows
         from client_boards b order by lower(b.label)`);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const baseId = baseIdFrom(b.base_id || b.url);
    if (!baseId) return NextResponse.json({ error: "Paste the Airtable link for the board, or its app... id." }, { status: 400 });
    const existing = await q("select id from client_boards where base_id = $1", [baseId]);
    if (existing.length) return NextResponse.json({ error: "That board is already on the list." }, { status: 400 });

    // Prove the token can actually read it before saving.
    let tables: { id: string; name: string }[];
    try { tables = await tablesIn(baseId); }
    catch (e: any) {
      return NextResponse.json({
        error: "Could not read that base. Add it under Access on your Airtable token, then try again. (" + e.message + ")",
      }, { status: 400 });
    }

    const label = String(b.label || "").trim() || tables[0]?.name || baseId;
    const rows = await q(
      "insert into client_boards (base_id, label, case_name, note) values ($1,$2,$3,$4) returning *",
      [baseId, label, b.case_name || null, b.note || null]);
    return NextResponse.json({ ok: true, board: rows[0], tables });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
