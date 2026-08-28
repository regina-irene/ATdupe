export const BASE = process.env.AIRTABLE_BASE_ID || "appAuA3Ifddk44H5m";
export const TIME_TABLE = process.env.AIRTABLE_TIME_TABLE_ID || "tblRbKiu4UYIC1i7Y";
export const STATUS_TABLE = process.env.AIRTABLE_TABLE_ID || "tbl3gCA0CQ0S6ewW6";
export const TASK_TABLE = process.env.AIRTABLE_TASK_TABLE_ID || "tblWNWCqeptUMFhbK";
export const PAY_TABLE = process.env.AIRTABLE_PAY_TABLE_ID || "tblwulRnma9qIKasp";

// Time table fields
export const F = {
  date: "flduEsqpvqmYYeI25", caseLink: "flddu3wS9BO3ZQmKU", content: "fldLulieZoiJf1mU0",
  entry: "fld7VYNi67tdgwVnA", duration: "fldsz7mj2q3W0vIBk", user: "fld2TfqJ33znLIrVe",
  firm: "fldf6CVPh3l1RjDwq", kind: "fld7ovIkeXLhjfsFg", created: "fldZTRjUhYpltd4T7",
  emailFrom: "fldGjdGyLUQQ445CO", emailTo: "fldZuK09hoT3BFqjh", url: "fldbxo8WXQUW7p4s9",
  done: "fldm0Z3GU81x1K0Ll", markDelete: "fldxISYvJcEMMfCJq",
};

// Tasks table fields
export const TF = {
  client: "fldsfITcR8OI1m8yX", caseLink: "fldYYuheriiICnpOB", status: "fldMTlXyunzRxAbdQ",
  order: "fldLcUu2a9JHKS9c3", priority: "fldeVCHkvVCFk934g", closed: "fldLvQkK5OIP0r7Qr",
  task: "fldBYK3sGE6PnNNsW", link: "fld6JblmmpWv2OUhV", users: "fld9Ee4nMHzcdNtoX",
  duration: "fldrh46WX975QEVnv", due: "fldRdAnumFrRe3rkJ", modified: "fldgyZNCEFYTUAJnJ",
};

// Payments table fields. The money splits and Year fields are Airtable
// formulas and rollups, so we read them for display but never write them.
export const PF = {
  caseLink: "fldg9S9545Toiaw9o", notes: "fldYTAJRe0ctNzgkz", cleared: "fldnB2GyHOimHEt3d",
  kind: "fldgPNgbi1w1okG93", caseType: "fldUausxqBTzPyEcL", date: "fldCDqlh0rNCIB85z",
  amount: "fldt3gUlHP9mKxgtU", method: "fldqLeWEnjkIEoQ6Q", endDate: "fldOksPJ6T62Gg3bl",
  // read-only
  year: "fldGbePvasoBApysL", yearMM: "fldvdJHq7RKQLMpqW", profit: "fldinNFe8xMFXifM2",
  ownerPay: "fldUt81p2NEzDpKch", tax: "fldQ1XcswoqwGsryI", operating: "fldxruQevbSNvUOoc",
  modified: "fld3HD2feyJlK1ELf",
};

function token(): string {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error("AIRTABLE_TOKEN is not set");
  return t;
}

export async function at(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch("https://api.airtable.com/v0/" + path, {
    ...init,
    headers: { Authorization: "Bearer " + token(), "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 300);
    if (r.status === 403) msg = "Airtable refused the request (403). The token needs data.records:write and this base under Access. " + msg;
    throw new Error("Airtable " + r.status + ": " + msg);
  }
  return text ? JSON.parse(text) : {};
}

export function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Airtable rich text / long text can arrive with markdown noise; keep it plain.
export const plain = (v: any) => {
  if (v === undefined || v === null) return null;
  let x: any = v;
  if (Array.isArray(x)) x = x.map((i) => (i && typeof i === "object" ? i.name ?? "" : i)).join(", ");
  else if (typeof x === "object") x = x.name ?? "";
  return String(x).trim() || null;
};
