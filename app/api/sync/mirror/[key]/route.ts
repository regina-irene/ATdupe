import { NextResponse } from "next/server";
import { db, q, ensureSchema } from "../../../../../lib/db";
import { authorize } from "../../../../../lib/auth";
import { at, chunk, sleep, BASE } from "../../../../../lib/airtable";
import { MIRRORS, schemaFor, coerce } from "../../../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function upsertMany(key: string, recs: any[], modifiedField: string | null) {
  if (!recs.length) return;
  const params: any[] = [];
  const tuples: string[] = [];
  for (const rec of recs) {
    const f = rec.fields || {};
    const mod = modifiedField && f[modifiedField] ? new Date(f[modifiedField]).toISOString() : null;
    params.push(key); const a = "$" + params.length;
    params.push(rec.id); const b = "$" + params.length;
    params.push(JSON.stringify(f)); const c = "$" + params.length;
    params.push(mod); const d = "$" + params.length;
    tuples.push(`(${a},${b},${c}::jsonb,${d},'airtable',now(),now())`);
  }
  await db()(
    `insert into mirror_rows (table_key, airtable_id, data, at_modified, source, synced_at, updated_at)
     values ${tuples.join(",")}
     on conflict (table_key, airtable_id) do update set
       data = excluded.data, at_modified = excluded.at_modified, synced_at = now(),
       updated_at = case when mirror_rows.data is distinct from excluded.data
                    then now() else mirror_rows.updated_at end`,
    params
  );
}

async function run(key: string) {
  const cfg = MIRRORS[key];
  if (!cfg) throw new Error("Unknown board: " + key);
  await ensureSchema();
  const started = Date.now();
  const { fields } = await schemaFor(key);
  const byId = new Map(fields.map((f) => [f.id, f] as const));
  const modifiedField = fields.find((f) => f.type === "lastModifiedTime")?.id || null;

  let pulled = 0;
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    if (offset) p.set("offset", offset);
    const j = await at(BASE + "/" + cfg.table + "?" + p.toString());
    const recs = j.records || [];
    await upsertMany(key, recs, modifiedField);
    pulled += recs.length;
    offset = j.offset;
    if (Date.now() - started > 200000) break;
  } while (offset);

  // Only fields Airtable will accept back.
  function fieldsFor(row: any) {
    const out: any = {};
    const data = row.data || {};
    for (const fid of Object.keys(data)) {
      const f = byId.get(fid);
      if (!f || !f.writable) continue;
      const v = coerce(f, data[fid]);
      if (v !== null && v !== undefined) out[fid] = v;
    }
    return out;
  }

  const toCreate = await q(
    "select * from mirror_rows where table_key=$1 and airtable_id is null and source='web' order by id limit 100", [key]);
  let pushedNew = 0;
  for (const group of chunk(toCreate, 10)) {
    const body = { records: group.map((r: any) => ({ fields: fieldsFor(r) })) };
    let res: any;
    try { res = await at(BASE + "/" + cfg.table, { method: "POST", body: JSON.stringify(body) }); }
    catch { res = await at(BASE + "/" + cfg.table, { method: "POST", body: JSON.stringify({ ...body, typecast: true }) }); }
    for (let i = 0; i < res.records.length; i++) {
      await q("update mirror_rows set airtable_id=$1, synced_at=now() where id=$2", [res.records[i].id, group[i].id]);
      pushedNew++;
    }
    await sleep(250);
  }

  const toUpdate = await q(
    `select * from mirror_rows where table_key=$1 and airtable_id is not null
       and (synced_at is null or updated_at > synced_at) order by id limit 100`, [key]);
  let pushedUpd = 0;
  for (const group of chunk(toUpdate, 10)) {
    const recs = group.map((r: any) => ({ id: r.airtable_id, fields: fieldsFor(r) }));
    try { await at(BASE + "/" + cfg.table, { method: "PATCH", body: JSON.stringify({ records: recs }) }); }
    catch { await at(BASE + "/" + cfg.table, { method: "PATCH", body: JSON.stringify({ typecast: true, records: recs }) }); }
    await q("update mirror_rows set synced_at=now() where id = any($1::bigint[])", [group.map((r: any) => r.id)]);
    pushedUpd += recs.length;
    await sleep(250);
  }

  const ms = Date.now() - started;
  await q("insert into sync_log (kind, pulled, pushed_new, pushed_upd, ms) values ($1,$2,$3,$4,$5)",
    ["mirror:" + key, pulled, pushedNew, pushedUpd, ms]);
  return { ok: true, pulled, pushed_new: pushedNew, pushed_upd: pushedUpd, ms };
}

async function handle(req: Request, ctx: any) {
  const isCron = !!req.headers.get("x-vercel-cron");
  if (!isCron && !(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = await ctx.params;
  try {
    return NextResponse.json(await run(p.key));
  } catch (e: any) {
    try { await q("insert into sync_log (kind, error) values ($1,$2)", ["mirror:" + p.key, String(e.message).slice(0, 500)]); } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
