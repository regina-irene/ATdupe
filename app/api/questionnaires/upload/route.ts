import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PARTY = /\b(father|mother|dad|mom|petitioner|respondent|plaintiff|defendant|husband|wife)\b/i;

const tidy = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Names come in two shapes:
//   "Monfared v. Christian - Mother (Farzaneh Monfared).html"  brackets = person
//   "Questionnaire - Mother (Buchanan).html"                   brackets = case
// So the case is the part that is left once the party word and the wrapper
// words are taken out, and the brackets are only used when nothing else is.
function fromName(name: string) {
  const base = name.replace(/\.html?$/i, "").trim();
  const partyM = base.match(PARTY);

  const paren = base.match(/\(([^)]{2,60})\)/);
  const person = paren ? paren[1].trim() : null;
  const withoutParen = base.replace(/\s*\([^)]*\)\s*/g, " ").trim();

  const NOISE = /^(gal\s*)?(intake\s*)?(form|questionnaire|questions|intake)$/i;
  const segments = withoutParen.split(/\s*[-–—]\s*/).map((x) => x.trim()).filter(Boolean);

  const candidates = segments.filter((seg) => {
    const bare = seg.replace(PARTY, "").replace(/\b(gal|intake|form|questionnaire)\b/gi, "").trim();
    if (!bare) return false;              // just the party, or just a wrapper word
    return !NOISE.test(seg);
  });

  let caseName = candidates[0] || null;
  // Nothing but the party and wrapper words: the brackets must be the case.
  if (!caseName && person) caseName = person;
  if (caseName) caseName = caseName.replace(/\s*(GAL|questionnaire|intake|form)\s*$/i, "").trim();

  return {
    caseName: caseName || null,
    party: partyM ? tidy(partyM[1] === "dad" ? "father" : partyM[1] === "mom" ? "mother" : partyM[1]) : null,
    person,
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
        out.title = fn.person || titleOf(html);
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
