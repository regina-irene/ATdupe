import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The stored transcript is "Question\nAnswer" blocks separated by blank lines.
function pairs(text: string) {
  return String(text || "").split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    return { q: (lines[0] || "").trim(), a: lines.slice(1).join("\n").trim() };
  }).filter((p) => p.q);
}

function document(r: any, forPrint: boolean) {
  const tint = /mother/i.test(r.party) ? "#9d174d" : /father/i.test(r.party) ? "#1e40af" : "#1f3352";
  const rows = pairs(r.responses).map((p) => `
    <div class="qa">
      <p class="q">${esc(p.q)}</p>
      <p class="a">${esc(p.a || "(no answer)")}</p>
    </div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(r.case_name)} - ${esc(r.party)} questionnaire</title>
<style>
  @page { size: letter; margin: 22mm 18mm; }
  body { font: 11.5pt/1.5 Calibri, "Segoe UI", Arial, sans-serif; color:#1c2431; }
  .firm { font-size:9pt; letter-spacing:.16em; text-transform:uppercase; color:${tint}; font-weight:700 }
  h1 { font-size:17pt; margin:6pt 0 2pt }
  .case { font-size:10pt; color:#61708a }
  .who { margin:14pt 0 4pt; padding:9pt 12pt; border-left:4pt solid ${tint}; background:#f6f7fa }
  .who b { font-size:13pt }
  .meta { font-size:9.5pt; color:#61708a; margin-top:2pt }
  .qa { margin:0 0 12pt; page-break-inside:avoid }
  .q { font-weight:700; margin:0 0 3pt; color:${tint} }
  .a { margin:0; white-space:pre-wrap }
  hr { border:none; border-top:1pt solid #d9dee6; margin:10pt 0 14pt }
  .foot { margin-top:18pt; font-size:9pt; color:#8a94a6 }
</style></head><body>
  <div class="firm">Edwards Family Law</div>
  <h1>Guardian ad Litem Questionnaire</h1>
  <div class="case">${esc(r.case_name)}</div>
  <div class="who">
    <b>${esc(r.person_name || r.party)}</b><br>
    <span class="meta">${esc(r.party)}${r.email ? " &middot; " + esc(r.email) : ""}${r.phone ? " &middot; " + esc(r.phone) : ""}</span><br>
    <span class="meta">Submitted ${esc(r.submitted_text || new Date(r.received_at).toLocaleString())}</span>
  </div>
  <hr>
  ${rows || "<p>No answers recorded.</p>"}
  <div class="foot">Confidential. Prepared from the questionnaire submitted through Chambers.</div>
  ${forPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script>' : ""}
</body></html>`;
}

export async function GET(req: Request) {
  if (!(await authorize(req)))
    return new Response("Not signed in", { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const id = parseInt(sp.get("id") || "0", 10);
    const format = sp.get("format") === "doc" ? "doc" : "print";
    const rows = await q("select * from questionnaire_responses where id = $1", [id]);
    if (!rows.length) return new Response("Not found", { status: 404 });
    const r = rows[0];

    const html = document(r, format === "print");
    const safe = `${r.case_name} - ${r.party} questionnaire`.replace(/[^\w \-.]/g, "").trim();

    if (format === "doc") {
      return new Response("﻿" + html, {
        headers: {
          // Word opens this happily and keeps the headings and spacing.
          "content-type": "application/msword; charset=utf-8",
          "content-disposition": `attachment; filename="${safe}.doc"`,
        },
      });
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e: any) {
    return new Response("Could not build the document: " + e.message, { status: 500 });
  }
}
