// Reads the payment summary off the end of a GAL bill.
//
// The bills are not laid out consistently: some print the amount on the same
// line as its label, others on the line below; some use "Payment from Father",
// others "PAYMENT FROM FATHER"; some carry a balance line, some do not; the
// retainer is sometimes a sum and sometimes a percentage. So rather than match
// whole lines, this walks the summary pairing each label with the next amount
// that follows it.
export type Party = {
  payments: { date: string; amount: number }[];
  balance: number | null;    // negative means credit remaining
  totalDue: number | null;
  initial?: number | null;   // the retainer paid at the outset
  share?: number | null;     // this party's percentage of the fees
};
export type Parsed = {
  parties: Record<string, Party>;
  subtotal: number | null;
  retainer: number | null;       // when the bill names a sum
  retainerNote: string | null;   // when it names a percentage
  caseName: string | null;
  billDate: string | null;
};

const AMOUNT = /\$\s*(\()?\s*([\d,]+\.\d{2})\)?/g;
const PAYMENT = /payment\s+from\s+([A-Za-z][A-Za-z']*)\s*[-–]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;
const BALANCE = /(?:([A-Za-z][A-Za-z']*)'s\s+(?:portion\s+of\s+(?:the\s+)?|share\s+of\s+(?:the\s+)?)?balance|balance\s+(?:due\s+)?(?:from|for)\s+([A-Za-z][A-Za-z']*))/i;
const TOTAL = /total\s+due\s+from\s+([A-Za-z][A-Za-z']*)/i;
const SUBTOTAL = /\bsub\s*total\b/i;

const num = (s: string) => Number(String(s).replace(/[,$\s]/g, ""));
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
function iso(d: string) {
  const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : d;
}

export function parseBill(text: string): Parsed {
  const lines = String(text || "").split(/\r?\n/);

  // The summary sits after the fee table, so start at the last subtotal.
  let start = 0;
  for (let i = lines.length - 1; i >= 0; i--) if (SUBTOTAL.test(lines[i])) { start = i; break; }
  if (!start) {
    const j = lines.findIndex((l) => /payment\s+from/i.test(l));
    if (j >= 0) start = j;
  }

  const parties: Record<string, Party> = {};
  const party = (n: string) => (parties[n] ||= { payments: [], balance: null, totalDue: null, initial: null, share: null });

  let subtotal: number | null = null;
  let pending: { k: string; p?: string; d?: string } | null = null;
  let labelEnd = -1;
  let age = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpMatchArray | null;
    // Only guard against a label's own bracketed figure on the line the label
    // is on. Carrying the offset onto the next line threw away amounts that sit
    // further left than the label above them.
    labelEnd = -1;

    if ((m = line.match(PAYMENT))) { pending = { k: "pay", p: title(m[1]), d: iso(m[2]) }; labelEnd = (m.index || 0) + m[0].length; age = 0; }
    else if ((m = line.match(BALANCE))) { pending = { k: "bal", p: title(m[1] || m[2]) }; labelEnd = (m.index || 0) + m[0].length; age = 0; }
    else if ((m = line.match(TOTAL))) {
      pending = { k: "tot", p: title(m[1]) };
      labelEnd = (m.index || 0) + m[0].length;
      age = 0;
      // The split is printed right after the name: "FROM FATHER (25%)".
      const pc = line.slice(labelEnd).match(/^\s*\(?\s*(\d{1,3})\s*%/);
      if (pc) party(pending.p!).share = Number(pc[1]);
    }
    else if ((m = line.match(SUBTOTAL))) { pending = { k: "sub" }; labelEnd = (m.index || 0) + m[0].length; age = 0; }

    if (!pending) continue;

    let took = false;
    AMOUNT.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = AMOUNT.exec(line))) {
      if (labelEnd >= 0 && a.index < labelEnd) continue;   // the label's own "($2500)"
      const negative = !!a[1];
      const value = num(a[2]);
      if (pending.k === "pay") party(pending.p!).payments.push({ date: pending.d!, amount: value });
      else if (pending.k === "bal") party(pending.p!).balance = negative ? -value : value;
      else if (pending.k === "tot") party(pending.p!).totalDue = value;
      else if (pending.k === "sub") subtotal = value;
      pending = null; labelEnd = -1; took = true;
      break;
    }
    if (!took && ++age > 4) { pending = null; labelEnd = -1; }
  }

  for (const k of Object.keys(parties)) {
    parties[k].payments.sort((x, y) => (x.date < y.date ? -1 : 1));
    // The opening retainer is everything paid on the first day money came in.
    // Buchanan's father paid $1.00 and $2,499.00 the same day to make $2,500.
    const first = parties[k].payments[0];
    parties[k].initial = first
      ? parties[k].payments.filter((p) => p.date === first.date).reduce((n, p) => n + p.amount, 0)
      : null;
  }

  // Retainer, either a sum ("($2500) requested") or a share ("replenishment (25%)").
  const flat = String(text || "").replace(/\s+/g, " ");
  const sum = flat.match(/\(\$?\s*([\d,]+(?:\.\d{2})?)\s*\)\s*requested/i);
  const pct = flat.match(/replenishment\s*\(?\s*(\d{1,3})\s*%/i);

  const nameM = String(text || "").match(/GAL Billing[^\n(]*\(([^)]{2,40})\)/i);


  return {
    parties,
    subtotal,
    retainer: sum ? num(sum[1]) : null,
    retainerNote: pct ? pct[1] + "%" : null,
    caseName: nameM ? nameM[1].trim() : null,
    billDate: null, // the as-of date is the one on the file name, never one from the entries
  };
}
