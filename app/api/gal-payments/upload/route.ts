import { NextResponse } from "next/server";
import { authorize } from "../../../../lib/auth";
import { extractLayoutText } from "../../../../lib/pdftext";
import { fromDelimited, fromText } from "../../../../lib/paymentdoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Reads receipts and exports and hands back candidates. Nothing is saved here
// on purpose: the amounts get checked on screen first.
export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No files were sent." }, { status: 400 });

    const results: any[] = [];
    for (const file of files) {
      const out: any = { file: file.name, candidates: [] as any[] };
      try {
        if (/\.(csv|tsv|txt)$/i.test(file.name)) {
          out.candidates = fromDelimited(await file.text());
          if (!out.candidates.length) out.candidates = fromText(await file.text());
        } else if (/\.pdf$/i.test(file.name)) {
          const text = await extractLayoutText(new Uint8Array(await file.arrayBuffer()));
          out.candidates = fromText(text);
        } else {
          out.why = "Only PDF, CSV, TSV and TXT can be read.";
        }
      } catch (e: any) {
        out.why = String(e.message).slice(0, 200);
      }
      results.push(out);
    }

    const found = results.reduce((n, r) => n + r.candidates.length, 0);
    return NextResponse.json({ ok: true, found, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
