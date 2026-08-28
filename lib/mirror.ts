import { at, BASE } from "./airtable";
import { getState, setState } from "./db";

// Tables mirrored wholesale rather than mapped column by column. Adding a
// field in Airtable makes it appear here with no code change.
export const MIRRORS: Record<string, { table: string; label: string; singular: string }> = {
  status: { table: process.env.AIRTABLE_TABLE_ID || "tbl3gCA0CQ0S6ewW6", label: "Cases", singular: "case" },
  clients: { table: process.env.AIRTABLE_CLIENT_TABLE_ID || "tblPPcVwWJ3IjBRLu", label: "Clients", singular: "client" },
};

export type Field = {
  id: string; name: string; type: string;
  writable: boolean;
  choices?: { name: string; color: string }[];
  linked?: string;
};

// Airtable computes these; sending them back is rejected.
const READ_ONLY = new Set([
  "formula", "rollup", "count", "lookup", "multipleLookupValues",
  "createdTime", "createdBy", "lastModifiedTime", "lastModifiedBy",
  "autoNumber", "button", "aiText", "externalSyncSource",
  "multipleRecordLinks", "multipleAttachments",
  "singleCollaborator", "multipleCollaborators",
]);

export const WRITABLE_TYPES = new Set([
  "singleLineText", "multilineText", "richText", "email", "url", "phoneNumber",
  "number", "currency", "percent", "duration", "rating",
  "checkbox", "date", "dateTime", "singleSelect", "multipleSelects", "barcode",
]);

export function isText(t: string) {
  return ["singleLineText", "multilineText", "richText", "email", "url", "phoneNumber"].indexOf(t) >= 0;
}
export function isNumber(t: string) {
  return ["number", "currency", "percent", "duration", "rating", "autoNumber"].indexOf(t) >= 0;
}

const KEY = (k: string) => "mirror_schema_" + k;
const AGE = 6 * 60 * 60 * 1000;

export async function schemaFor(key: string, force = false): Promise<{ fields: Field[]; primary: string }> {
  const cfg = MIRRORS[key];
  if (!cfg) throw new Error("Unknown board: " + key);
  const cached = await getState(KEY(key));
  if (!force && cached) {
    const j = JSON.parse(cached);
    if (Date.now() - (j.at || 0) < AGE) return { fields: j.fields, primary: j.primary };
  }
  const meta = await at("meta/bases/" + BASE + "/tables");
  const t = (meta.tables || []).find((x: any) => x.id === cfg.table);
  if (!t) throw new Error("Table " + cfg.table + " is not in this base, or the token cannot read the schema.");
  const fields: Field[] = (t.fields || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    writable: WRITABLE_TYPES.has(f.type) && !READ_ONLY.has(f.type),
    choices: (f.options?.choices || []).map((c: any) => ({ name: c.name, color: c.color || "" })),
    linked: f.options?.linkedTableId,
  }));
  const primary = t.primaryFieldId;
  await setState(KEY(key), JSON.stringify({ at: Date.now(), fields, primary }));
  return { fields, primary };
}

// Turn a value from the board into what Airtable expects for that field type.
export function coerce(f: Field, v: any): any {
  if (v === "" || v === undefined) return null;
  switch (f.type) {
    case "checkbox": return !!v;
    case "number": case "currency": case "percent": case "duration": case "rating": {
      const n = Number(v); return isNaN(n) ? null : n;
    }
    case "date": return v ? String(v).slice(0, 10) : null;
    case "dateTime": return v ? new Date(v).toISOString() : null;
    case "multipleSelects": return Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean);
    default: return v === null ? null : String(v);
  }
}
