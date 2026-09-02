// Pulls candidate payments out of a receipt, remittance or processor export.
// Deliberately returns candidates rather than saving: these are payments, and a
// wrong figure here is worse than typing it by hand.
export type Candidate = {
  party: string | null;
  paid_on: string | null;
  amount: number | null;
  method: string | null;
  source: string;      // the line it came from, so it can be checked
};

const METHODS = ["zelle", "visa", "mastercard", "amex", "american express", "discover", "ach",
  "check", "cheque", "cash", "wire", "credit card", "debit", "lawpay", "gravity", "paypal", "venmo"];

const money = (s: string) => Number(String(s).replace(/[,$\s]/g, ""));

function isoDate(raw: string): string | null {
  let m = raw.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const yr = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = raw.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = raw.match(/([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(20\d{2})/);
  if (m) {
    const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function methodIn(s: string): string | null {
  const l = s.toLowerCase();
  for (const m of METHODS) if (l.indexOf(m) >= 0) return m.replace(/\b\w/g, (c) => c.toUpperCase());
  return null;
}

function partyIn(s: string): string | null {
  const m = s.match(/\b(father|mother|petitioner|respondent|plaintiff|defendant)\b/i);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

// "2026.07.20 Payment from Father - $750 (Buchanan GAL).pdf" carries the date,
// the party, the amount and the case. When a receipt is named like that there
// is nothing left to work out.
export function fromFilename(name: string): Partial<Candidate> & { caseName?: string | null } {
  const out: any = {};
  const d = name.match(/(20\d{2})[.\-_](\d{1,2})[.\-_](\d{1,2})/);
  if (d) out.paid_on = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
  else {
    const us = name.match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](20\d{2})/);
    if (us) out.paid_on = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const who = name.match(/payment\s+from\s+([A-Za-z][A-Za-z']*)/i);
  if (who) out.party = who[1].charAt(0).toUpperCase() + who[1].slice(1).toLowerCase();
  const amt = name.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (amt) out.amount = Number(amt[1].replace(/,/g, ""));
  const paren = name.match(/\(([^)]{2,60})\)/);
  if (paren) out.caseName = paren[1].replace(/\s*GAL\s*$/i, "").trim();
  return out;
}

// A spreadsheet export: work from the headings.
export function fromDelimited(text: string): Candidate[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].indexOf("\t") >= 0 ? "\t" : ",";
  const cut = (l: string) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
  const head = cut(lines[0]).map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h.indexOf(n) >= 0));
  const iDate = find("date", "paid", "posted");
  const iAmt = find("amount", "total", "paid", "sum");
  const iWho = find("party", "payer", "payor", "name", "from", "client");
  const iHow = find("method", "type", "card", "how", "source");
  if (iDate < 0 || iAmt < 0) return [];

  const out: Candidate[] = [];
  for (const line of lines.slice(1)) {
    const c = cut(line);
    const amount = money(c[iAmt] || "");
    if (!isFinite(amount) || !amount) continue;
    out.push({
      paid_on: isoDate(c[iDate] || ""),
      amount: Math.abs(amount),
      party: iWho >= 0 ? partyIn(c[iWho]) || c[iWho] || null : null,
      method: iHow >= 0 ? c[iHow] || null : null,
      source: line.slice(0, 120),
    });
  }
  return out;
}

// A receipt: any line carrying both a date and an amount is a candidate.
export function fromText(text: string): Candidate[] {
  const lines = String(text || "").split(/\r?\n/);
  const docParty = partyIn(text);
  const docMethod = methodIn(text);
  const out: Candidate[] = [];

  for (const line of lines) {
    if (!/\$\s*[\d,]+\.\d{2}|\b[\d,]+\.\d{2}\b/.test(line)) continue;
    const d = isoDate(line);
    if (!d) continue;
    const amt = line.match(/\$\s*([\d,]+\.\d{2})/) || line.match(/\b([\d,]+\.\d{2})\b/);
    if (!amt) continue;
    // Skip anything that reads like a balance or a total rather than a payment.
    if (/\b(balance|subtotal|total due|invoice total|amount due)\b/i.test(line)) continue;
    out.push({
      party: partyIn(line) || docParty,
      paid_on: d,
      amount: money(amt[1]),
      method: methodIn(line) || docMethod,
      source: line.trim().slice(0, 120),
    });
  }

  // "Payment of $750.00 received from Brian K Buchanan Jr." with the method on
  // its own line, which is how the processor's notices read.
  const recv = String(text || "").match(/payment of\s*\$\s*([\d,]+\.\d{2})\s*received/i);
  const meth = String(text || "").match(/payment\s+method:\s*([^\n]{2,40})/i);
  if (recv && !out.length) {
    const d = isoDate(String(text || ""));
    out.push({
      party: docParty, paid_on: d, amount: money(recv[1]),
      method: meth ? meth[1].replace(/ending in.*/i, "").trim() : docMethod,
      source: recv[0],
    });
  }
  if (meth) for (const c of out) if (!c.method) c.method = meth[1].replace(/ending in.*/i, "").trim();

  // A single-receipt PDF often has the amount and the date on separate lines.
  if (!out.length) {
    const d = isoDate(text);
    const amt = text.match(/(?:amount|paid|payment|total)[^$\n]{0,40}\$\s*([\d,]+\.\d{2})/i)
      || text.match(/\$\s*([\d,]+\.\d{2})/);
    if (d && amt) out.push({ party: docParty, paid_on: d, amount: money(amt[1]), method: docMethod, source: "whole document" });
  }
  return out;
}
