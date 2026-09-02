import { unzipSync, strFromU8 } from "fflate";

// Turns a workbook into the same shape of text the PDF reader produces, so one
// parser handles bills whether they arrive as a PDF or a spreadsheet.
// Numbers are written back as currency, negatives in brackets, which is how
// they are printed on the PDF bills.
const money = (n: number) =>
  (n < 0 ? "$ (" : "$ ") +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
  (n < 0 ? ")" : "");

const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const colOf = (ref: string) => {
  const m = ref.match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

// Excel keeps dates as a serial number counted from 1900.
function serialToDate(n: number): string | null {
  if (!(n > 20000 && n < 60000)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

export function xlsxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const find = (re: RegExp) => Object.keys(files).find((k) => re.test(k));

  let shared: string[] = [];
  const ssName = find(/^xl\/sharedStrings\.xml$/);
  if (ssName) {
    const xml = strFromU8(files[ssName]);
    shared = (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) =>
      unesc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
        .map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  }

  const sheetName = find(/^xl\/worksheets\/sheet1\.xml$/) || find(/^xl\/worksheets\/.*\.xml$/);
  if (!sheetName) return "";
  const xml = strFromU8(files[sheetName]);

  const lines: string[] = [];
  for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const cells: string[] = [];
    for (const c of row.match(/<c[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (c.match(/r="([A-Z]+\d+)"/) || [])[1] || "";
      const type = (c.match(/t="([^"]+)"/) || [])[1] || "n";
      const raw = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const inline = (c.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
      let text = "";
      if (type === "s" && raw != null) text = shared[Number(raw)] ?? "";
      else if (type === "inlineStr" && inline != null) text = unesc(inline);
      else if (raw != null) {
        const n = Number(raw);
        text = isFinite(n) ? (serialToDate(n) || money(n)) : raw;
      }
      if (!text) continue;
      const at = colOf(ref);
      while (cells.length < at) cells.push("");
      cells[at] = text;
    }
    if (cells.some((x) => x && x.trim())) lines.push(cells.join("   "));
  }
  return lines.join("\n");
}
