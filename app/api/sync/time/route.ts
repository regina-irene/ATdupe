import { NextResponse } from "next/server";
import { db, q, ensureSchema, getState, setState, stampSync, ymd } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, chunk, sleep, BASE, TIME_TABLE, F } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

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
    const links = f[F.caseLink] || [];
    const caseId = links.length ? links[0] : null;
    const user = f[F.user] || null;
    const vals = [
      rec.id,
      f[F.date] ? String(f[F.date]).slice(0, 10) : String(rec.createdTime).slice(0, 10),
      caseId ? byId.get(caseId) || null : null, caseId,
      f[F.entry] || null, num(f[F.duration]),
      user ? user.name || user.email || null : null, user ? user.email || null : null,
      f[F.firm] || null, f[F.kind] || null, f[F.url] || null, f[F.content] || null,
      f[F.emailFrom] || null, f[F.emailTo] || null, !!f[F.done], !!f[F.markDelete],
    ];
    const slots: string[] = [];
    for (const v of vals) { params.push(v); slots.push("$" + params.length); }
    tuples.push("(" + slots.join(",") + ",'airtable',now(),now())");
  }
  await db()(
    `insert into time_entries (airtable_id, entry_date, case_name, case_id, time_entry, duration, user_name, user_email, firm, kind, url, content, email_from, email_to, done, marked_for_deletion, source, synced_at, updated_at)
     values ${tuples.join(",")}
     on conflict (airtable_id) do update set
       entry_date = case when time_entries.source in ('web','api') then time_entries.entry_date else excluded.entry_date end,
       case_name=excluded.case_name, case_id=excluded.case_id, time_entry=excluded.time_entry,
       duration=excluded.duration, user_name=excluded.user_name, user_email=excluded.user_email,
       firm=excluded.firm, kind=excluded.kind, url=excluded.url, content=excluded.content,
       email_from=excluded.email_from, email_to=excluded.email_to, done=excluded.done,
       marked_for_deletion=excluded.marked_for_deletion, synced_at=now(), updated_at=now()`,
    params
  );
}

async function backfill() {
  await ensureSchema();
  const started = Date.now();
  const { byId } = await loadCases();
  await setState("backfill_offset", null);
  const cursor = (await getState("backfill_cursor")) || "2000-01-01T00:00:00.000Z";
  let pulled = parseInt((await getState("backfill_count")) || "0", 10);
  let thisRun = 0, done = false, lastCreated = cursor;
  let offset: string | undefined;

  while (true) {
    const p = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    p.set("sort[0][field]", F.created);
    p.set("sort[0][direction]", "asc");
    p.set("filterByFormula", `NOT(IS_BEFORE(CREATED_TIME(), DATETIME_PARSE("${cursor}")))`);
    if (offset) p.set("offset", offset);
    const j = await at(BASE + "/" + TIME_TABLE + "?" + p.toString());
    const recs = j.records || [];
    await upsertMany(recs, byId);
    for (const rec of recs) lastCreated = rec.createdTime;
    pulled += recs.length; thisRun += recs.length;
    offset = j.offset;
    if (!offset) { done = true; break; }
    if (Date.now() - started > 240000) break;
  }

  if (done) { await setState("backfill_cursor", null); await setState("backfill_count", null); }
  else {
    let next = lastCreated;
    if (next === cursor) next = new Date(Date.parse(cursor) + 1000).toISOString();
    await setState("backfill_cursor", next);
    await setState("backfill_count", String(pulled));
  }
  await q("insert into sync_log (kind, pulled, ms) values ('time',$1,$2)", [thisRun, Date.now() - started]);
  // Let the next page load pick up any Airtable colour changes.
  try { await setState("choice_colors_at", "0"); } catch {}

  await stampSync("time");
  return { ok: true, mode: "backfill", done, pulled: thisRun, total_pulled: pulled, pushed_new: 0, pushed_upd: 0, fixed_dates: 0, ms: Date.now() - started };
}

async function run() {
  await ensureSchema();
  const started = Date.now();
  const windowDays = parseInt(process.env.SYNC_WINDOW_DAYS || "60", 10);
  const pullDays = parseInt(process.env.SYNC_PULL_DAYS || "3", 10);
  const { byId, idByName } = await loadCases();

  let pulled = 0;
  const cutoff = Date.now() - pullDays * 86400000;
  let offset: string | undefined;
  let stop = false;
  do {
    const p = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    p.set("sort[0][field]", F.created);
    p.set("sort[0][direction]", "desc");
    if (offset) p.set("offset", offset);
    const j = await at(BASE + "/" + TIME_TABLE + "?" + p.toString());
    const keep: any[] = [];
    for (const rec of j.records || []) {
      if (Date.parse(rec.createdTime) < cutoff) { stop = true; break; }
      keep.push(rec);
    }
    await upsertMany(keep, byId);
    pulled += keep.length;
    if (stop) break;
    offset = j.offset;
  } while (offset);

  function fieldsFor(r: any) {
    const out: any = {};
    out[F.date] = ymd(r.entry_date);
    if (r.time_entry) out[F.entry] = r.time_entry;
    if (r.duration !== null && r.duration !== undefined) out[F.duration] = Number(r.duration);
    if (r.firm) out[F.firm] = r.firm;
    if (r.kind) out[F.kind] = r.kind;
    if (r.url) out[F.url] = r.url;
    if (r.content) out[F.content] = r.content;
    const cid = r.case_name ? idByName.get(String(r.case_name).toLowerCase()) : null;
    if (cid && !String(cid).startsWith("manual:")) out[F.caseLink] = [cid];
    return out;
  }

  const toCreate = await q(`select * from time_entries where airtable_id is null and source in ('web','api') and entry_date >= current_date - $1::int order by id limit 300`, [windowDays]);
  let pushedNew = 0;
  for (const group of chunk(toCreate, 10)) {
    const body = { records: group.map((r: any) => ({ fields: fieldsFor(r) })) };
    let res: any;
    try { res = await at(BASE + "/" + TIME_TABLE, { method: "POST", body: JSON.stringify(body) }); }
    catch { res = await at(BASE + "/" + TIME_TABLE, { method: "POST", body: JSON.stringify({ ...body, typecast: true }) }); }
    for (let i = 0; i < res.records.length; i++) {
      await q("update time_entries set airtable_id=$1, synced_at=now() where id=$2", [res.records[i].id, group[i].id]);
      pushedNew++;
    }
    await sleep(250);
  }

  const toUpdate = await q(`select * from time_entries where airtable_id is not null and source in ('web','api') and (synced_at is null or updated_at > synced_at) and entry_date >= current_date - $1::int order by id limit 300`, [windowDays]);
  let pushedUpd = 0;
  for (const group of chunk(toUpdate, 10)) {
    await at(BASE + "/" + TIME_TABLE, { method: "PATCH", body: JSON.stringify({ records: group.map((r: any) => ({ id: r.airtable_id, fields: fieldsFor(r) })) }) });
    const ids = group.map((r: any) => r.id);
    await q("update time_entries set synced_at=now() where id = any($1::bigint[])", [ids]);
    pushedUpd += ids.length;
    await sleep(250);
  }

  const drift = await q(`select id, airtable_id, to_char(entry_date,'YYYY-MM-DD') as d from time_entries where airtable_id is not null and source in ('web','api') and entry_date >= current_date - $1::int order by id desc limit 200`, [windowDays]);
  let fixed = 0;
  if (drift.length) {
    const byRec = new Map(drift.map((x: any) => [x.airtable_id, x]));
    for (const group of chunk(drift.map((x: any) => x.airtable_id), 10)) {
      const p = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: "10" });
      for (const id of group) p.append("records[]", id as string);
      let got: any;
      try { got = await at(BASE + "/" + TIME_TABLE + "?" + p.toString()); } catch { continue; }
      const wrong = (got.records || []).filter((rec: any) => {
        const local: any = byRec.get(rec.id);
        if (!local) return false;
        const atDate = rec.fields[F.date] ? String(rec.fields[F.date]).slice(0, 10) : "";
        return atDate !== local.d;
      });
      if (wrong.length) {
        await at(BASE + "/" + TIME_TABLE, { method: "PATCH", body: JSON.stringify({ records: wrong.map((rec: any) => ({ id: rec.id, fields: { [F.date]: (byRec.get(rec.id) as any).d } })) }) });
        fixed += wrong.length;
      }
      await sleep(250);
    }
  }

  const ms = Date.now() - started;
  await q("insert into sync_log (kind, pulled, pushed_new, pushed_upd, fixed_dates, ms) values ('time',$1,$2,$3,$4,$5)", [pulled, pushedNew, pushedUpd, fixed, ms]);
  await stampSync("time");
  return { ok: true, mode: "incremental", done: true, pulled, pushed_new: pushedNew, pushed_upd: pushedUpd, fixed_dates: fixed, ms };
}

async function handle(req: Request) {
  const isCron = !!req.headers.get("x-vercel-cron");
  if (!isCron && !(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const u = new URL(req.url);
  try {
    if (u.searchParams.get("reset") === "1") {
      await ensureSchema();
      await setState("backfill_cursor", null);
      await setState("backfill_count", null);
      await setState("backfill_offset", null);
      return NextResponse.json({ ok: true, reset: true });
    }
    return NextResponse.json(u.searchParams.get("full") === "1" ? await backfill() : await run());
  } catch (e: any) {
    try { await q("insert into sync_log (kind, error) values ('time',$1)", [String(e.message).slice(0, 500)]); } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
