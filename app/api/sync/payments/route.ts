import { NextResponse } from "next/server";
import { db, q, ensureSchema, ymd } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, chunk, sleep, plain, BASE, PAY_TABLE, PF } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const day = (v: any) => (v ? String(v).slice(0, 10) : null);

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
    const links = f[PF.caseLink] || [];
    const caseId = links.length ? links[0] : null;
    const vals = [
      rec.id,
      caseId ? byId.get(caseId) || null : null,
      caseId,
      day(f[PF.date]),
      num(f[PF.amount]),
      plain(f[PF.kind]),
      plain(f[PF.method]),
      plain(f[PF.caseType]),
      plain(f[PF.cleared]),
      plain(f[PF.notes]),
      day(f[PF.endDate]),
      num(f[PF.year]),
      plain(f[PF.yearMM]),
      num(f[PF.profit]),
      num(f[PF.ownerPay]),
      num(f[PF.tax]),
      num(f[PF.operating]),
      f[PF.modified] ? new Date(f[PF.modified]).toISOString() : null,
    ];
    const slots: string[] = [];
    for (const v of vals) { params.push(v); slots.push("$" + params.length); }
    tuples.push("(" + slots.join(",") + ",'airtable',now(),now())");
  }
  await db()(
    `insert into payments (airtable_id, case_name, case_id, pay_date, amount, kind, method, case_type,
       cleared, notes, end_date, year, year_mm, profit, owner_pay, tax, operating, at_modified,
       source, synced_at, updated_at)
     values ${tuples.join(",")}
     on conflict (airtable_id) do update set
       case_name=excluded.case_name, case_id=excluded.case_id, pay_date=excluded.pay_date,
       amount=excluded.amount, kind=excluded.kind, method=excluded.method, case_type=excluded.case_type,
       cleared=excluded.cleared, notes=excluded.notes, end_date=excluded.end_date,
       year=excluded.year, year_mm=excluded.year_mm, profit=excluded.profit,
       owner_pay=excluded.owner_pay, tax=excluded.tax, operating=excluded.operating,
       at_modified=excluded.at_modified, synced_at=now(),
       updated_at = case when (payments.case_name, payments.case_id, payments.pay_date, payments.amount,
                               payments.kind, payments.method, payments.case_type, payments.cleared,
                               payments.notes, payments.end_date)
                         is distinct from
                             (excluded.case_name, excluded.case_id, excluded.pay_date, excluded.amount,
                              excluded.kind, excluded.method, excluded.case_type, excluded.cleared,
                              excluded.notes, excluded.end_date)
                    then now() else payments.updated_at end
     where payments.synced_at is null or payments.updated_at <= payments.synced_at`,
    params
  );
}

async function run() {
  await ensureSchema();
  const started = Date.now();
  const { byId, idByName } = await loadCases();

  // 1,591 rows today, so one full sweep per run keeps Airtable edits flowing in.
  let pulled = 0;
  // Runs after the pushes below, so local edits reach Airtable first
  // and the pull then brings back whatever Airtable made of them.
  const doPull = async () => {
      let offset: string | undefined;
    do {
      const p = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
      if (offset) p.set("offset", offset);
      const j = await at(BASE + "/" + PAY_TABLE + "?" + p.toString());
      const recs = j.records || [];
      await upsertMany(recs, byId);
      pulled += recs.length;
      offset = j.offset;
      if (Date.now() - started > 200000) break;
    } while (offset);
  };


  // Only the fields Airtable does not calculate itself.
  function fieldsFor(p: any) {
    const out: any = {};
    if (p.pay_date) out[PF.date] = ymd(p.pay_date);
    if (p.amount !== null && p.amount !== undefined) out[PF.amount] = Number(p.amount);
    if (p.kind) out[PF.kind] = p.kind;
    if (p.method) out[PF.method] = p.method;
    if (p.case_type) out[PF.caseType] = p.case_type;
    if (p.cleared) out[PF.cleared] = p.cleared;
    if (p.notes) out[PF.notes] = p.notes;
    if (p.end_date) out[PF.endDate] = ymd(p.end_date);
    const cid = p.case_name ? idByName.get(String(p.case_name).toLowerCase()) : null;
    if (cid && !String(cid).startsWith("manual:")) out[PF.caseLink] = [cid];
    return out;
  }

  const toCreate = await q("select * from payments where airtable_id is null and source = 'web' order by id limit 200");
  let pushedNew = 0;
  for (const group of chunk(toCreate, 10)) {
    const body = { records: group.map((p: any) => ({ fields: fieldsFor(p) })) };
    let res: any;
    try { res = await at(BASE + "/" + PAY_TABLE, { method: "POST", body: JSON.stringify(body) }); }
    catch { res = await at(BASE + "/" + PAY_TABLE, { method: "POST", body: JSON.stringify({ ...body, typecast: true }) }); }
    for (let i = 0; i < res.records.length; i++) {
      await q("update payments set airtable_id=$1, synced_at=now() where id=$2", [res.records[i].id, group[i].id]);
      pushedNew++;
    }
    await sleep(250);
  }

  const toUpdate = await q("select * from payments where airtable_id is not null and (synced_at is null or updated_at > synced_at) order by id limit 200");
  let pushedUpd = 0;
  for (const group of chunk(toUpdate, 10)) {
    const recs = group.map((p: any) => ({ id: p.airtable_id, fields: fieldsFor(p) }));
    try { await at(BASE + "/" + PAY_TABLE, { method: "PATCH", body: JSON.stringify({ records: recs }) }); }
    catch { await at(BASE + "/" + PAY_TABLE, { method: "PATCH", body: JSON.stringify({ typecast: true, records: recs }) }); }
    const ids = group.map((p: any) => p.id);
    await q("update payments set synced_at=now() where id = any($1::bigint[])", [ids]);
    pushedUpd += ids.length;
    await sleep(250);
  }

  await doPull();

  const ms = Date.now() - started;
  await q("insert into sync_log (kind, pulled, pushed_new, pushed_upd, ms) values ('payments',$1,$2,$3,$4)", [pulled, pushedNew, pushedUpd, ms]);
  return { ok: true, pulled, pushed_new: pushedNew, pushed_upd: pushedUpd, ms };
}

async function handle(req: Request) {
  const isCron = !!req.headers.get("x-vercel-cron");
  if (!isCron && !(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e: any) {
    try { await q("insert into sync_log (kind, error) values ('payments',$1)", [String(e.message).slice(0, 500)]); } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
