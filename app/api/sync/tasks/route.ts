import { NextResponse } from "next/server";
import { db, q, ensureSchema, ymd } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, chunk, sleep, plain, BASE, TASK_TABLE, TF } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const joinSel = (v: any) => (Array.isArray(v) ? v.join(", ") : v ? String(v) : null);

async function loadCases() {
  const rows = await q("select id, name from cases");
  const byId = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const c of rows) { byId.set(c.id, c.name); idByName.set(String(c.name).toLowerCase(), c.id); }
  return { byId, idByName };
}

async function upsertMany(recs: any[], byId: Map<string, string>) {
  if (!recs.length) return;
  const params: any[] = [];
  const tuples: string[] = [];
  for (const rec of recs) {
    const f = rec.fields || {};
    const links = f[TF.caseLink] || [];
    const caseId = links.length ? links[0] : null;
    const due = f[TF.due] ? String(f[TF.due]).slice(0, 10) : null;
    const vals = [
      rec.id,
      plain(f[TF.client]),
      caseId ? byId.get(caseId) || null : null,
      caseId,
      plain(f[TF.task]),
      plain(f[TF.status]),
      plain(f[TF.priority]),
      joinSel(f[TF.users]),
      num(f[TF.order]),
      !!f[TF.closed],
      due,
      plain(f[TF.link]),
      num(f[TF.duration]),
      f[TF.modified] ? new Date(f[TF.modified]).toISOString() : null,
    ];
    const slots: string[] = [];
    for (const v of vals) { params.push(v); slots.push("$" + params.length); }
    tuples.push("(" + slots.join(",") + ",'airtable',now(),now())");
  }
  await db()(
    `insert into tasks (airtable_id, client_name, case_name, case_id, task, status, priority, who, ord, closed, due_date, link, duration, at_modified, source, synced_at, updated_at)
     values ${tuples.join(",")}
     on conflict (airtable_id) do update set
       client_name=excluded.client_name, case_name=excluded.case_name, case_id=excluded.case_id,
       task=excluded.task, status=excluded.status, priority=excluded.priority, who=excluded.who,
       ord=excluded.ord, closed=excluded.closed, due_date=excluded.due_date, link=excluded.link,
       duration=excluded.duration, at_modified=excluded.at_modified, synced_at=now(),
       updated_at = case when (tasks.client_name, tasks.case_name, tasks.case_id, tasks.task,
                               tasks.status, tasks.priority, tasks.who, tasks.ord, tasks.closed,
                               tasks.due_date, tasks.link, tasks.duration)
                         is distinct from
                             (excluded.client_name, excluded.case_name, excluded.case_id, excluded.task,
                              excluded.status, excluded.priority, excluded.who, excluded.ord, excluded.closed,
                              excluded.due_date, excluded.link, excluded.duration)
                    then now() else tasks.updated_at end`,
    params
  );
}

async function run() {
  await ensureSchema();
  const started = Date.now();
  const { byId, idByName } = await loadCases();

  // Pull the whole Tasks table. It is small enough to sweep every run, which
  // means edits made in Airtable are picked up, not just new rows.
  let pulled = 0;
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    if (offset) p.set("offset", offset);
    const j = await at(BASE + "/" + TASK_TABLE + "?" + p.toString());
    const recs = j.records || [];
    await upsertMany(recs, byId);
    pulled += recs.length;
    offset = j.offset;
    if (Date.now() - started > 200000) break;
  } while (offset);

  function fieldsFor(t: any) {
    const out: any = {};
    if (t.task) out[TF.task] = t.task;
    if (t.status) out[TF.status] = t.status;
    if (t.priority) out[TF.priority] = t.priority;
    if (t.who) out[TF.users] = String(t.who).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (t.ord !== null && t.ord !== undefined) out[TF.order] = Number(t.ord);
    out[TF.closed] = !!t.closed;
    if (t.due_date) out[TF.due] = ymd(t.due_date);
    if (t.link) out[TF.link] = t.link;
    if (t.client_name) out[TF.client] = t.client_name;
    const cid = t.case_name ? idByName.get(String(t.case_name).toLowerCase()) : null;
    if (cid && !String(cid).startsWith("manual:")) out[TF.caseLink] = [cid];
    return out;
  }

  const toCreate = await q("select * from tasks where airtable_id is null and source = 'web' order by id limit 200");
  let pushedNew = 0;
  for (const group of chunk(toCreate, 10)) {
    const body = { records: group.map((t: any) => ({ fields: fieldsFor(t) })) };
    let res: any;
    try { res = await at(BASE + "/" + TASK_TABLE, { method: "POST", body: JSON.stringify(body) }); }
    catch { res = await at(BASE + "/" + TASK_TABLE, { method: "POST", body: JSON.stringify({ ...body, typecast: true }) }); }
    for (let i = 0; i < res.records.length; i++) {
      await q("update tasks set airtable_id=$1, synced_at=now() where id=$2", [res.records[i].id, group[i].id]);
      pushedNew++;
    }
    await sleep(250);
  }

  const toUpdate = await q("select * from tasks where airtable_id is not null and (synced_at is null or updated_at > synced_at) order by id limit 200");
  let pushedUpd = 0;
  for (const group of chunk(toUpdate, 10)) {
    try {
      await at(BASE + "/" + TASK_TABLE, { method: "PATCH", body: JSON.stringify({ records: group.map((t: any) => ({ id: t.airtable_id, fields: fieldsFor(t) })) }) });
    } catch {
      await at(BASE + "/" + TASK_TABLE, { method: "PATCH", body: JSON.stringify({ typecast: true, records: group.map((t: any) => ({ id: t.airtable_id, fields: fieldsFor(t) })) }) });
    }
    const ids = group.map((t: any) => t.id);
    await q("update tasks set synced_at=now() where id = any($1::bigint[])", [ids]);
    pushedUpd += ids.length;
    await sleep(250);
  }

  const ms = Date.now() - started;
  await q("insert into sync_log (kind, pulled, pushed_new, pushed_upd, ms) values ('tasks',$1,$2,$3,$4)", [pulled, pushedNew, pushedUpd, ms]);
  return { ok: true, pulled, pushed_new: pushedNew, pushed_upd: pushedUpd, ms };
}

async function handle(req: Request) {
  const isCron = !!req.headers.get("x-vercel-cron");
  if (!isCron && !(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e: any) {
    try { await q("insert into sync_log (kind, error) values ('tasks',$1)", [String(e.message).slice(0, 500)]); } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
