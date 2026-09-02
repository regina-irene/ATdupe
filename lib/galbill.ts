// Pulls the payment summary off the end of a GAL bill. Written against the
// real layout: payments, each party's balance, and the total due including the
// retainer replenishment.
export type Party = {
  payments: { date: string; amount: number }[];
  balance: number | null;      // negative in the bill means credit remaining
  totalDue: number | null;
  retainer: number | null;
};
export type Parsed = {
  parties: Record<string, Party>;
  subtotal: number | null;
  caseName: string | null;
  billDate: string | null;
};

const num = (s: string) => Number(String(s).replace(/[,$\s]/g, ""));
const iso = (d: string) => {
  const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return d;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

function party(all: Record<string, Party>, name: string): Party {
  if (!all[name]) all[name] = { payments: [], balance: null, totalDue: null, retainer: null };
  return all[name];
}

export function parseBill(text: string): Parsed {
  const t = String(text || "");
  const parties: Record<string, Party> = {};

  // "Payment from Father - 11/21/2025   $ (2,499.00)"
  for (const m of t.matchAll(/Payment from ([A-Za-z][A-Za-z']*)\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})[^$\n]*\$\s*\(?\s*([\d,]+\.\d{2})\)?/g)) {
    party(parties, m[1].trim()).payments.push({ date: iso(m[2]), amount: num(m[3]) });
  }
  // "Father's balance   $ (508.13)"  — bracketed means a credit, so negative.
  for (const m of t.matchAll(/([A-Za-z][A-Za-z']*?)'s balance[^$\n]*\$\s*(\(?)\s*([\d,]+\.\d{2})\)?/g)) {
    party(parties, m[1].trim()).balance = (m[2] ? -1 : 1) * num(m[3]);
  }
  // "Total due from Father [current balance plus retainer replenishment]  $ 1,991.88"
  for (const m of t.matchAll(/Total due from ([A-Za-z][A-Za-z']*)\b[^$\n]*\$\s*\(?\s*([\d,]+\.\d{2})\)?/g)) {
    party(parties, m[1].trim()).totalDue = num(m[2]);
  }
  // "($2500) requested"
  const ret = t.match(/\(\$?\s*([\d,]+(?:\.\d{2})?)\s*\)\s*requested/i);
  if (ret) for (const k of Object.keys(parties)) parties[k].retainer = num(ret[1]);

  const sub = t.match(/Subtotal[^$\n]*\$\s*([\d,]+\.\d{2})/i);

  // "2026.06.05 GAL Billing - CORRECTED (Buchanan)" style headers, if present.
  const nameM = t.match(/\(([A-Z][A-Za-z' .-]{2,40})\)\s*(?:GAL)?\s*$/m) || t.match(/GAL Billing[^\n(]*\(([^)]{2,40})\)/);
  const dateM = t.match(/\b(20\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\b/);

  for (const k of Object.keys(parties)) {
    parties[k].payments.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  return {
    parties,
    subtotal: sub ? num(sub[1]) : null,
    caseName: nameM ? nameM[1].trim() : null,
    billDate: dateM ? `${dateM[1]}-${dateM[2].padStart(2, "0")}-${dateM[3].padStart(2, "0")}` : null,
  };
}
