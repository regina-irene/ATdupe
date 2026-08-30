import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { tablesIn, baseName } from "../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sch = { name: string; primary: string; done?: string; fileId?: string };

// The per-board schemas the sync already cached tell us what each table is,
// which lets the list page summarise inside the boards without more API calls.
async function schemaMap(): Promise<Map<string, Sch>> {
  const rows = await q("select key, value from sync_state where key like 'mirror_schema_b:%'");
  const out = new Map<string, Sch>();
  for (const r of rows) {
    try {
      const j = JSON.parse(r.value);
      const fields: any[] = j.fields || [];
      const find = (n: string, t?: string) =>
        fields.find((f) => String(f.name).trim().toLowerCase() === n && (!t || f.type === t))?.id;
      out.set(String(r.key).replace(/^mirror_schema_/, ""), {
        name: j.label || "",
        primary: j.primary,
        done: find("done", "checkbox"),
        fileId: find("file id"),
      });
    } catch {}
  }
  return out;
}

const values = (pairs: [string, string][], params: any[]) =>
  pairs.map(([a, b]) => { params.push(a, b); return `($${params.length - 1}::text,$${params.length}::text)`; }).join(",");

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

    // Everything below is a bonus; a failure here must not blank the list.
    try {
      const sch = await schemaMap();
      const perTable = await q(
        `select table_key, count(*)::int as n, max(coalesce(at_modified, updated_at)) as last
           from mirror_rows where table_key like 'b:%' group by table_key`);

      const donePairs: [string, string][] = [];
      const updatePairs: [string, string][] = [];
      const filesByBase = new Map<string, number>();
      const tablesByBase = new Map<string, number>();
      const lastByBase = new Map<string, string>();

      for (const t of perTable) {
        const key = String(t.table_key);
        const base = key.split(":")[1];
        const meta = sch.get(key);
        tablesByBase.set(base, (tablesByBase.get(base) || 0) + 1);
        const prev = lastByBase.get(base);
        if (t.last && (!prev || new Date(t.last) > new Date(prev))) lastByBase.set(base, t.last);
        if (!meta) continue;
        if (meta.done) donePairs.push([key, meta.done]);
        if (meta.fileId) filesByBase.set(base, (filesByBase.get(base) || 0) + t.n);
        if (meta.name.trim().toLowerCase() === "client update" && meta.primary) updatePairs.push([key, meta.primary]);
      }

      const openByBase = new Map<string, number>();
      if (donePairs.length) {
        const params: any[] = [];
        const vals = values(donePairs, params);
        const res = await q(
          `with m(tk, fid) as (values ${vals})
           select m.tk, count(*) filter (where coalesce((r.data->m.fid)::boolean, false) = false)::int as open
             from m join mirror_rows r on r.table_key = m.tk group by m.tk`, params);
        for (const r of res) {
          const base = String(r.tk).split(":")[1];
          openByBase.set(base, (openByBase.get(base) || 0) + (r.open || 0));
        }
      }

      const updByBase = new Map<string, { text: string; at: string }>();
      if (updatePairs.length) {
        const params: any[] = [];
        const vals = values(updatePairs, params);
        const res = await q(
          `with m(tk, fid) as (values ${vals})
           select distinct on (m.tk) m.tk, r.data->>m.fid as txt, coalesce(r.at_modified, r.updated_at) as at
             from m join mirror_rows r on r.table_key = m.tk
            order by m.tk, coalesce(r.at_modified, r.updated_at) desc nulls last, r.id desc`, params);
        for (const r of res) {
          if (!r.txt) continue;
          updByBase.set(String(r.tk).split(":")[1], { text: String(r.txt), at: r.at });
        }
      }

      for (const b of rows as any[]) {
        b.tables = tablesByBase.get(b.base_id) || 0;
        b.open_items = openByBase.get(b.base_id) ?? null;
        b.files = filesByBase.get(b.base_id) ?? null;
        b.last_activity = lastByBase.get(b.base_id) || null;
        const u = updByBase.get(b.base_id);
        b.update_text = u ? u.text.replace(/<[^>]*>/g, "") : null;
        b.update_at = u ? u.at : null;
      }
    } catch {}

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
