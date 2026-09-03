import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PARTY = /\b(father|mother|dad|mom|petitioner|respondent|plaintiff|defendant|husband|wife)\b/i;

const tidy = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// "Buchanan - Father Questionnaire.html", "Questionnaire - Mother (Buchanan).html"
function fromName(name: string) {
  const base = name.replace(/\.html?$/i, "");
  const party = base.match(PARTY);
  const paren = base.match(/\(([^)]{2,60})\)/);
  let caseName = paren ? paren[1] : null;
  if (!caseName) {
    const bits = base.split(/\s*[-–]\s*/).map((x) => x.trim()).filter(Boolean);
    const notParty = bits.filter((x) => !PARTY.test(x) && !/questionnaire/i.test(x));
    if (notParty.length) caseName = notParty[0];
  }
  if (caseName) caseName = caseName.replace(/\s*(GAL|questionnaire)\s*$/i, "").trim();
  return {
    caseName: caseName || null,
    party: party ? tidy(party[1] === "dad" ? "father" : party[1] === "mom" ? "mother" : party[1]) : null,
  };
}

// A readable title from the document itself where it has one.
function titleOf(html: string) {
  const t = html.match(/<title[^>]*>([\s\S]{2,120}?)<\/title>/i);
  if (t) return t[1].replace(/\s+/g, " ").trim();
  const h = html.match(/<h1[^>]*>([\s\S]{2,120}?)<\/h1>/i);
  return h ? h[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
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
        if (!/\.html?$/i.test(file.name)) { out.status = "skipped"; out.why = "Only .html files."; results.push(out); continue; }
        const html = await file.text();
        if (html.length > 4_000_000) { out.status = "failed"; out.why = "Over 4 MB."; results.push(out); continue; }
        const fn = fromName(file.name);
        out.case_name = (form.get("case_name") as string) || fn.caseName;
        out.party = (form.get("party") as string) || fn.party;
        out.title = titleOf(html);
        out.size = html.length;
        out.html = html;
        out.status = out.case_name && out.party ? "ready" : "needs-details";
      } catch (e: any) {
        out.status = "failed";
        out.why = String(e.message).slice(0, 160);
      }
      results.push(out);
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
