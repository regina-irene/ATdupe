import { NextResponse } from "next/server";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You rewrite shorthand time entries for a Georgia family law firm into billing-ready narrative.

Hard rules:
- Rewrite wording only. NEVER invent work, participants, documents, filings, or outcomes that are not present in the input.
- If the input is vague, keep it vague. Do not guess at specifics to make it sound fuller.
- Do not inflate. A short task stays a short task.
- Standard legal billing style: past tense, no first-person pronouns, no filler.
- Expand abbreviations only where unambiguous: OC = opposing counsel, PP = parenting plan, MBS = marital balance sheet, CSW = child support worksheet, GAL = guardian ad litem, TC = telephone conference, RPD = request for production of documents, DRFA = domestic relations financial affidavit, NTP = notice to produce, LOA = leave of absence, FJD = final judgment and decree.
- One or two sentences maximum.
- Never mention hours, rates, dates, or dollar amounts.
- Return only the rewritten narrative. No preamble, no quotation marks, no explanation.`;

export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in Vercel." }, { status: 500 });
  try {
    const b = await req.json();
    const text = String(b.text || "").trim();
    if (!text) return NextResponse.json({ error: "Nothing to rewrite." }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ error: "That entry is too long to rewrite." }, { status: 400 });

    const user = [
      b.case_name ? "Matter: " + String(b.case_name).slice(0, 200) : null,
      b.kind ? "Entry type: " + String(b.kind).slice(0, 60) : null,
      "Shorthand entry: " + text,
    ].filter(Boolean).join("\n");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5", max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) {
      const m = j?.error?.message || ("Anthropic returned " + r.status);
      return NextResponse.json({ error: m + (r.status === 404 ? " Set ANTHROPIC_MODEL in Vercel to a model your key can use." : "") }, { status: 500 });
    }
    const out = (j.content || []).map((c: any) => c.text || "").join("").trim();
    if (!out) return NextResponse.json({ error: "No suggestion came back. Try again." }, { status: 500 });
    return NextResponse.json({ text: out });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
