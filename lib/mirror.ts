import { at, BASE } from "./airtable";
import { getState, setState } from "./db";

// Tables mirrored wholesale rather than mapped column by column. Adding a
// field in Airtable makes it appear here with no code change.
export const MIRRORS: Record<string, { table: string; label: string; singular: string }> = {
  status: { table: process.env.AIRTABLE_TABLE_ID || "tbl3gCA0CQ0S6ewW6", label: "Case Status", singular: "case" },
  clients: { table: process.env.AIRTABLE_CLIENT_TABLE_ID || "tblPPcVwWJ3IjBRLu", label: "Clients", singular: "client" },
  // Listed so the Tasks board can offer every Airtable field as a column.
  tasks: { table: process.env.AIRTABLE_TASK_TABLE_ID || "tblWNWCqeptUMFhbK", label: "Tasks", singular: "task" },
};

// A board key is either one of MIRRORS above, or "b:<baseId>:<tableId>" for a
// table in any other base (the per-matter client boards).
export function resolve(key: string): { base: string; table: string; label: string; singular: string } {
  const fixed = MIRRORS[key];
  if (fixed) return { base: BASE, table: fixed.table, label: fixed.label, singular: fixed.singular };
  const m = /^b:(app[A-Za-z0-9]{14}):(tbl[A-Za-z0-9]{14})$/.exec(key);
  if (m) return { base: m[1], table: m[2], label: "", singular: "record" };
  throw new Error("Unknown board: " + key);
}

// The base's own name in Airtable, e.g. "Boatman, Deja". Cached because the
// list endpoint is paginated and rarely changes.
export async function baseName(baseId: string): Promise<string | null> {
  const cached = await getState("base_names");
  let map: Record<string, string> = {};
  try { map = cached ? JSON.parse(cached) : {}; } catch {}
  if (map[baseId]) return map[baseId];
  let offset: string | undefined;
  do {
    const j = await at("meta/bases" + (offset ? "?offset=" + offset : ""));
    for (const b of j.bases || []) map[b.id] = b.name;
    offset = j.offset;
  } while (offset && !map[baseId]);
  await setState("base_names", JSON.stringify(map));
  return map[baseId] || null;
}

// Every table in a base, for building the sub-tabs of a client board.
export async function tablesIn(baseId: string): Promise<{ id: string; name: string; count?: number }[]> {
  if (!/^app[A-Za-z0-9]{14}$/.test(baseId)) throw new Error("That does not look like an Airtable base id.");
  const meta = await at("meta/bases/" + baseId + "/tables");
  return (meta.tables || []).map((t: any) => ({ id: t.id, name: t.name }));
}

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
const AGE = 15 * 60 * 1000; // choice colours and field changes show up within 15 minutes

export async function schemaFor(key: string, force = false): Promise<{ fields: Field[]; primary: string; label: string; singular: string }> {
  const cfg = resolve(key);
  const cached = await getState(KEY(key));
  if (!force && cached) {
    const j = JSON.parse(cached);
    if (Date.now() - (j.at || 0) < AGE) return { fields: j.fields, primary: j.primary, label: j.label, singular: j.singular };
  }
  const meta = await at("meta/bases/" + cfg.base + "/tables");
  const t = (meta.tables || []).find((x: any) => x.id === cfg.table);
  if (!t) throw new Error("Table " + cfg.table + " is not in base " + cfg.base + ", or the token cannot read that base's schema.");
  const fields: Field[] = (t.fields || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    writable: WRITABLE_TYPES.has(f.type) && !READ_ONLY.has(f.type),
    choices: (f.options?.choices || []).map((c: any) => ({ name: c.name, color: c.color || "" })),
    linked: f.options?.linkedTableId,
  }));
  const label = cfg.label || t.name;
  const singular = cfg.singular === "record" ? "record" : cfg.singular;
  const primary = t.primaryFieldId;
  await setState(KEY(key), JSON.stringify({ at: Date.now(), fields, primary, label, singular }));
  return { fields, primary, label, singular };
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
