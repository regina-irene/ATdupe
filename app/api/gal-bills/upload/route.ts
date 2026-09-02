import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { parseBill } from "../../../../lib/galbill";
import { extractLayoutText } from "../../../../lib/pdftext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "2026.06.05 GAL Billing - CORRECTED (Buchanan).pdf" gives us both the
// as-of date and the case, which is where they actually live.
function fromFilename(name: string) {
  // "2026.06.05 ..." and "... through 6.22.2026" are both in use.
  let d = name.match(/(20\d{2})[.\-_](\d{1,2})[.\-_](\d{1,2})/);
  if (!d) {
    const us = name.match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](20\d{2})/);
    if (us) d = [us[0], us[3], us[1], us[2]] as any;
  }
  const paren = name.match(/\(([^)]{2,60})\)/);
  let caseName = paren ? paren[1].trim() : null;
  if (!caseName) {
    const m = name.replace(/\.pdf$/i, "").match(/GAL Billing\s*[-–]?\s*(.+)$/i);
    if (m) caseName = m[1].replace(/CORRECTED/i, "").replace(/[-–\s]+$/, "").trim() || null;
  }
  if (caseName) caseName = caseName.replace(/\s*GAL\s*$/i, "").trim();
  return {
    caseName,
    billDate: d ? `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}` : null,
  };
}

export async function POST(req: Request) {
  const s = await authorize(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No files were sent." }, { status: 400 });

    const results: any[] = [];

    for (const file of files) {
      const out: any = { file: file.name };
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const text = await extractLayoutText(buf);
        const parsed = parseBill(text);

        const fn = fromFilename(file.name);
        const caseName = (form.get("case_name") as string) || fn.caseName || parsed.caseName;
        const billDate = (form.get("bill_date") as string) || fn.billDate; // never guessed from the text

        out.parsed = parsed;
        out.case_name = caseName;
        out.bill_date = billDate;

        if (!Object.keys(parsed.parties).length) { out.status = "no-summary"; results.push(out); continue; }
        if (!caseName || !billDate) { out.status = "needs-details"; results.push(out); continue; }

        await q(
          `insert into gal_bills (case_name, bill_date, subtotal, data, updated_by)
           values ($1,$2,$3,$4::jsonb,$5)
           on conflict (lower(case_name), bill_date) do update set
             subtotal = excluded.subtotal, data = excluded.data,
             updated_by = excluded.updated_by, updated_at = now()`,
          [caseName, billDate, parsed.subtotal, JSON.stringify({ parties: parsed.parties }), s.email || null]);
        out.status = "saved";
      } catch (e: any) {
        out.status = "failed";
        out.why = String(e.message).slice(0, 200);
      }
      results.push(out);
    }

    return NextResponse.json({
      ok: true,
      saved: results.filter((r) => r.status === "saved").length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
