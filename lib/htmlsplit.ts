// Splits a questionnaire that holds both parents into one document per parent.
// Works on the markup rather than on rendering, so it does not need a browser.

const PARTY_WORDS = "father|mother|dad|mom|husband|wife|petitioner|respondent|parent\\s*a|parent\\s*b|party\\s*a|party\\s*b";
const PARTY_RE = new RegExp(PARTY_WORDS, "i");

export type Part = { party: string; html: string; how: string };

function tidyParty(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (/father|dad|husband/.test(s)) return "Father";
  if (/mother|mom|wife/.test(s)) return "Mother";
  if (/petitioner/.test(s)) return "Petitioner";
  if (/respondent/.test(s)) return "Respondent";
  if (/(parent|party)\s*a/.test(s)) return "Parent A";
  if (/(parent|party)\s*b/.test(s)) return "Parent B";
  return raw.trim().slice(0, 24);
}

// Walks forward from an opening tag to its matching close, counting nesting.
function outerHtml(html: string, openStart: number): string | null {
  const tagM = html.slice(openStart).match(/^<([a-zA-Z][\w-]*)/);
  if (!tagM) return null;
  const tag = tagM[1];
  const openTag = new RegExp(`<${tag}(\\s|>|/>)`, "gi");
  const closeTag = new RegExp(`</${tag}\\s*>`, "gi");
  // self closing
  const firstGt = html.indexOf(">", openStart);
  if (firstGt > 0 && html[firstGt - 1] === "/") return html.slice(openStart, firstGt + 1);

  let depth = 0;
  let i = openStart;
  while (i < html.length) {
    openTag.lastIndex = i;
    closeTag.lastIndex = i;
    const o = openTag.exec(html);
    const c = closeTag.exec(html);
    if (!c) return null;
    if (o && o.index < c.index) { depth++; i = o.index + 1; continue; }
    depth--;
    if (depth === 0) return html.slice(openStart, c.index + c[0].length);
    i = c.index + 1;
  }
  return null;
}

function headOf(html: string): string {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  let out = head ? head[1] : "";
  // Styles sometimes sit in the body; keep those too or the part looks wrong.
  for (const m of html.matchAll(/<style[\s\S]*?<\/style>/gi)) {
    if (!out.includes(m[0])) out += "\n" + m[0];
  }
  for (const m of html.matchAll(/<link[^>]+rel=["']?stylesheet[^>]*>/gi)) {
    if (!out.includes(m[0])) out += "\n" + m[0];
  }
  return out;
}

const wrap = (head: string, inner: string, title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}` +
  `<style>[hidden],.hidden{display:block!important}</style></head><body>${inner}</body></html>`;

export function splitByParty(html: string, docTitle = "Questionnaire"): Part[] {
  const head = headOf(html);
  const found: { party: string; start: number; how: string }[] = [];

  // 1. A container whose id, class or data attribute names a parent.
  const attrRe = new RegExp(
    `<([a-zA-Z][\\w-]*)\\b[^>]*?(?:id|class|data-party|data-tab|data-target|data-section|name)\\s*=\\s*["'][^"']*(${PARTY_WORDS})[^"']*["'][^>]*>`,
    "gi");
  for (const m of html.matchAll(attrRe)) {
    const tag = m[1].toLowerCase();
    if (["a", "button", "label", "option", "li", "span"].includes(tag)) continue;  // those are the tab buttons
    found.push({ party: tidyParty(m[2]), start: m.index!, how: "section marked " + m[2].trim() });
  }

  // 2. Otherwise a heading that names a parent, taking everything to the next heading.
  if (found.length < 2) {
    const heads = [...html.matchAll(/<h[1-4][^>]*>([\s\S]{0,160}?)<\/h[1-4]>/gi)];
    for (let i = 0; i < heads.length; i++) {
      const text = heads[i][1].replace(/<[^>]+>/g, " ");
      const m = text.match(PARTY_RE);
      if (!m) continue;
      const from = heads[i].index!;
      const to = i + 1 < heads.length ? heads[i + 1].index! : html.length;
      const inner = html.slice(from, to);
      if (inner.replace(/<[^>]+>/g, "").trim().length < 40) continue;   // just a tab label
      found.push({ party: tidyParty(m[0]), start: -1, how: "heading " + text.trim().slice(0, 40) });
      (found[found.length - 1] as any).html = inner;
    }
  }

  const parts: Part[] = [];
  const seen = new Set<string>();
  for (const f of found) {
    if (seen.has(f.party)) continue;
    const inner = (f as any).html ?? (f.start >= 0 ? outerHtml(html, f.start) : null);
    if (!inner) continue;
    if (inner.replace(/<[^>]+>/g, "").trim().length < 60) continue;     // too little to be a questionnaire
    seen.add(f.party);
    parts.push({ party: f.party, how: f.how, html: wrap(head, inner, `${docTitle} - ${f.party}`) });
  }

  // Only useful if it genuinely found more than one parent.
  return parts.length >= 2 ? parts : [];
}
