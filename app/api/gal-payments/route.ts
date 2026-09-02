import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Payments taken after a bill went out. Kept against the case rather than the
// bill, so importing a newer bill never loses them.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await q(
      `select id, case_name, party, to_char(paid_on,'YYYY-MM-DD') as paid_on, amount, method, note
         from gal_payments order by lower(case_name), paid_on desc, id desc`);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = await authorize(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const list = Array.isArray(b.payments) ? b.payments : [b];
    const added: any[] = [];
    const bad: string[] = [];
    for (const p of list) {
      const caseName = String(p.case_name || b.case_name || "").trim();
      const party = String(p.party || "").trim();
      const amount = Number(p.amount);
      if (!caseName || !party || !p.paid_on || !isFinite(amount) || amount === 0) {
        bad.push(JSON.stringify(p).slice(0, 80));
        continue;
      }
      const r = await q(
        `insert into gal_payments (case_name, party, paid_on, amount, method, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [caseName, party.charAt(0).toUpperCase() + party.slice(1).toLowerCase(),
         p.paid_on, Math.abs(amount), p.method || null, p.note || null, s.email || null]);
      added.push(r[0]?.id);
    }
    if (!added.length) return NextResponse.json({ error: "Nothing usable. Each payment needs a party, a date and an amount." }, { status: 400 });
    return NextResponse.json({ ok: true, added: added.length, skipped: bad.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
