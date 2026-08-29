import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { tablesIn, baseName } from "../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
        ["apprWGHbkKL7ZoLMK", (await baseName("apprWGHbkKL7ZoLMK").catch(() => null)) || "Client board",
         "Link it to a case, then sync its tables."]);
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
    // One link, or a whole list pasted in at once.
    const raw = String(b.url || b.base_id || "");
    const ids = Array.from(new Set((raw.match(/app[A-Za-z0-9]{14}/g) || [])));
    if (!ids.length) return NextResponse.json({ error: "Paste the Airtable link for the board, or its app... id." }, { status: 400 });

    const added: any[] = [];
    const skipped: string[] = [];
    const failed: { id: string; why: string }[] = [];

    for (const baseId of ids) {
      const existing = await q("select id from client_boards where base_id = $1", [baseId]);
      if (existing.length) { skipped.push(baseId); continue; }
      try { await tablesIn(baseId); }
      catch (e: any) { failed.push({ id: baseId, why: e.message }); continue; }
      const label = (ids.length === 1 && String(b.label || "").trim())
        || (await baseName(baseId).catch(() => null))
        || baseId;
      const rows = await q(
        "insert into client_boards (base_id, label, case_name, note) values ($1,$2,$3,$4) returning *",
        [baseId, label, ids.length === 1 ? (b.case_name || null) : null, b.note || null]);
      added.push(rows[0]);
    }

    if (!added.length && failed.length)
      return NextResponse.json({
        error: "Could not read " + failed.length + " base(s). Add them under Access on your Airtable token. (" + failed[0].why + ")",
      }, { status: 400 });

    return NextResponse.json({ ok: true, added, skipped, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
