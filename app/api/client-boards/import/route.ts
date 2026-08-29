import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, plain, BASE, CLIENT_TABLE, CLF } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Every client board lives in the Clients table: the client's Name is the
// board name, and Client Base ID says which Airtable base it is.
export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();

    // Airtable record id -> case name, so a client links to its case exactly.
    const caseRows = await q("select id, name from cases");
    const caseById = new Map<string, string>(caseRows.map((c: any) => [c.id, c.name]));

    let records: any[] = [];
    let offset: string | undefined;
    do {
      const p = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
      if (offset) p.set("offset", offset);
      const j = await at(BASE + "/" + CLIENT_TABLE + "?" + p.toString());
      records = records.concat(j.records || []);
      offset = j.offset;
    } while (offset);

    let added = 0, updated = 0, noBase = 0;
    const names: string[] = [];

    for (const rec of records) {
      const f = rec.fields || {};
      const name = plain(f[CLF.name]);
      const rawBase = plain(f[CLF.baseId]) || "";
      const m = rawBase.match(/app[A-Za-z0-9]{14}/);
      if (!m) { noBase++; continue; }
      const baseId = m[0];

      const links: string[] = ([] as string[])
        .concat(f[CLF.statusLink] || [])
        .concat(f[CLF.statusLink2] || []);
      let caseName: string | null = null;
      for (const id of links) { const n = caseById.get(id); if (n) { caseName = n; break; } }
      if (!caseName && name && caseById.size) {
        const lower = String(name).toLowerCase();
        for (const n of caseById.values()) { if (String(n).toLowerCase() === lower) { caseName = n; break; } }
      }

      const existing = await q("select id from client_boards where base_id = $1", [baseId]);
      if (existing.length) {
        await q(
          `update client_boards set label = $2, case_name = coalesce($3, case_name) where base_id = $1`,
          [baseId, name || baseId, caseName]);
        updated++;
      } else {
        await q(
          `insert into client_boards (base_id, label, case_name, note) values ($1,$2,$3,$4)
           on conflict (base_id) do nothing`,
          [baseId, name || baseId, caseName, "From the Clients table"]);
        added++;
        if (names.length < 5) names.push(String(name || baseId));
      }
    }

    return NextResponse.json({
      ok: true, seen: records.length, added, updated, no_base: noBase, sample: names,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
