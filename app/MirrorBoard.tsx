"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MultiSelect from "./MultiSelect";
import Chip from "./Chip";
import Linkify, { labelFor } from "./Linkify";
import { Resizer, useColWidths } from "./colwidths";
import RowSize from "./RowSize";
import { Fragment, GroupDef, GroupPicker, GroupRow, buildGroups } from "./group";
import SyncButton from "./SyncButton";
import BulkBar, { BulkField, SelectAllTh, SelectTd, useSelection } from "./BulkBar";

type Field = { id: string; name: string; type: string; writable: boolean; choices?: { name: string; color: string }[] };
type Cond = { fid: string; op: string; val: any };
type View = { id: number; name: string; owner?: string; params: any };
type Row = { id: number; airtable_id: string | null; data: any; at_modified: string | null; updated_at: string; source: string };

const TEXTY = ["singleLineText", "multilineText", "richText", "email", "url", "phoneNumber", "barcode"];
const NUMY = ["number", "currency", "percent", "duration", "rating", "autoNumber"];
const DATEY = ["date", "dateTime", "lastModifiedTime", "createdTime"];
// Cases go amber then red when the client has not been updated.
const STALE_DAYS = 14;
const daysSince = (v: any) => {
  if (!v) return Infinity;
  const t = new Date(v).getTime();
  return isNaN(t) ? Infinity : Math.floor((Date.now() - t) / 86400000);
};

function when(v: any): string {
  if (!v) return "";
  const t = new Date(v);
  if (isNaN(t.getTime())) return "";
  const y = String(t.getFullYear()).slice(2);
  const m = String(t.getMinutes()).padStart(2, "0");
  const ap = t.getHours() >= 12 ? "PM" : "AM";
  return `${t.getMonth() + 1}/${t.getDate()}/${y} ${t.getHours() % 12 || 12}:${m} ${ap}`;
}
const strip = (v: any) => String(v ?? "").replace(/<[^>]*>/g, "");

export default function MirrorBoard({ boardKey }: { boardKey: string }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [label, setLabel] = useState("");
  const [singular, setSingular] = useState("record");
  const [primary, setPrimary] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const pick = useSelection<number>();
  const [bulking, setBulking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [q, setQ] = useState("");
  const [conds, setConds] = useState<Cond[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addTerm, setAddTerm] = useState("");
  const addBox = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState("");
  const [dir, setDir] = useState("asc");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [shown, setShown] = useState<string[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [picker, setPicker] = useState(false);
  const [term, setTerm] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragged = useRef(false);
  const cw = useColWidths("efl.mirror." + boardKey + ".widths");
  const pickerBox = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState<number | null>(null);
  const [cellEdit, setCellEdit] = useState<{ id: number; fid: string } | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [views, setViews] = useState<View[]>([]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [boardMap, setBoardMap] = useState<Record<string, string>>({});
  const [groupId, setGroupId] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({});

  const LAYOUT = "efl.mirror." + boardKey + ".columns";
  const byId = useMemo(() => new Map(fields.map((f) => [f.id, f] as const)), [fields]);
  const colorsFor = (f: Field) => Object.fromEntries((f.choices || []).map((c) => [c.name, c.color]));

  // Cases links out to the matching per-matter client board.
  useEffect(() => {
    if (boardKey !== "status") return;
    fetch("/api/client-boards").then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const b of j.rows || []) if (b.case_name) m[String(b.case_name).trim().toLowerCase()] = b.base_id;
      setBoardMap(m);
    }).catch(() => {});
  }, [boardKey]);

  // Arriving from a client board with ?q=<case name> pre-fills the search.
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("q");
      if (v) setQ(v);
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/mirror/" + boardKey + "/schema").then((r) => r.json()).then((j) => {
      if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
      setFields(j.fields || []); setLabel(j.label || ""); setSingular(j.singular || "record"); setPrimary(j.primary || "");
    }).catch((e) => setMsg({ kind: "err", text: e.message }));
  }, [boardKey]);

  // First visit shows a readable handful; after that, whatever you chose.
  useEffect(() => {
    if (!fields.length || layoutReady) return;
    let next: string[] | null = null;
    try {
      const raw = localStorage.getItem(LAYOUT);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) next = saved.filter((id: any) => fields.some((f) => f.id === id));
      }
    } catch {}
    if (!next || !next.length) next = fields.slice(0, 8).map((f) => f.id);
    setShown(next);
    setLayoutReady(true);
  }, [fields, layoutReady, LAYOUT]);

  function persist(next: string[]) {
    setShown(next);
    try { localStorage.setItem(LAYOUT, JSON.stringify(next)); } catch {}
  }
  function toggleCol(id: string) {
    persist(shown.indexOf(id) >= 0 ? shown.filter((c) => c !== id) : [...shown, id]);
  }
  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = shown.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    persist(next);
  }
  useEffect(() => {
    if (!addOpen) return;
    const away = (e: MouseEvent) => { if (addBox.current && !addBox.current.contains(e.target as Node)) setAddOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [addOpen]);

  useEffect(() => {
    if (!picker) return;
    const away = (e: MouseEvent) => { if (pickerBox.current && !pickerBox.current.contains(e.target as Node)) setPicker(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [picker]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    for (const c of conds) {
      if (c.op === "eq") { for (const v of (c.val as string[]) || []) p.append("f", c.fid + ":eq:" + v); }
      else if (c.op === "empty" || c.op === "notempty") p.append("f", c.fid + ":" + c.op + ":");
      else if (c.val !== "" && c.val !== undefined && c.val !== null) p.append("f", c.fid + ":" + c.op + ":" + c.val);
    }
    if (sort) p.set("sort", sort);
    p.set("dir", dir);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [q, conds, sort, dir, page]);

  const viewPage = "mirror:" + boardKey;
  const loadViews = useCallback(() => {
    fetch("/api/views?page=" + encodeURIComponent(viewPage))
      .then((r) => r.json()).then((j) => { if (!j.error) setViews(j.rows || []); }).catch(() => {});
  }, [viewPage]);
  useEffect(() => { loadViews(); }, [loadViews]);

  const current = useMemo(() => ({ q, conds, sort, dir }), [q, conds, sort, dir]);
  const isBlank = q === "" && conds.length === 0 && sort === "";
  function sameAs(params: any) {
    return JSON.stringify({ q: params?.q ?? "", conds: params?.conds ?? [], sort: params?.sort ?? "", dir: params?.dir ?? "asc" })
      === JSON.stringify(current);
  }
  function applyView(params: any) {
    setQ(params?.q ?? "");
    setConds(Array.isArray(params?.conds) ? params.conds : []);
    setSort(params?.sort ?? "");
    setDir(params?.dir ?? "asc");
    setPage(1);
  }
  async function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const dupe = views.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (dupe && !confirm('A view called "' + dupe.name + '" already exists. Replace it?')) return;
    const j = await (await fetch("/api/views", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: viewPage, name, params: current }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setNaming(false); setViewName("");
    setMsg({ kind: "ok", text: 'Saved the view "' + name + '".' });
    loadViews();
  }
  async function deleteView(v: View) {
    if (!confirm('Delete the saved view "' + v.name + '"?')) return;
    const j = await (await fetch("/api/views/" + v.id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    loadViews();
  }

  const load = useCallback(async () => {
    if (!fields.length) return;
    setLoading(true);
    try {
      const r = await fetch("/api/mirror/" + boardKey + "?" + qs);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []); setTotal(j.total || 0); setMsg(null);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setLoading(false);
  }, [qs, boardKey, fields.length]);
  useEffect(() => { load(); }, [load]);

  function sortBy(fid: string) {
    if (dragged.current) return;
    if (sort === fid) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(fid); setDir("asc"); }
    setPage(1);
  }

  // Inline: one field, saved as soon as it changes.
  async function saveCell(row: Row, f: Field, value: any) {
    setCellEdit(null);
    const before = row.data?.[f.id];
    const same = Array.isArray(before) || Array.isArray(value)
      ? JSON.stringify(before ?? []) === JSON.stringify(value ?? [])
      : String(before ?? "") === String(value ?? "");
    if (same) return;
    const r = await fetch("/api/mirror/" + boardKey + "/" + row.id, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { [f.id]: value } }),
    });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  // What a cell turns into once you click it.
  function inlineCell(f: Field, row: Row) {
    const v = row.data?.[f.id];
    const done = (val: any) => saveCell(row, f, val);
    if (f.type === "singleSelect") return (
      <select autoFocus defaultValue={v ?? ""} onBlur={() => setCellEdit(null)} onChange={(e) => done(e.target.value)}>
        <option value="">-</option>
        {(f.choices || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>);
    if (f.type === "multipleSelects") return (
      <div className="row" style={{ gap: 5 }}>
        <div style={{ flex: 1 }}>
          <MultiSelect label="" allLabel="None" options={(f.choices || []).map((c) => c.name)}
            value={Array.isArray(v) ? v : v ? [v] : []} onChange={(nv) => done(nv)} />
        </div>
        <button className="btn ghost sm" onClick={() => setCellEdit(null)}>Done</button>
      </div>);
    if (f.type === "date") return (
      <input type="date" autoFocus defaultValue={v ? String(v).slice(0, 10) : ""}
        onBlur={() => setCellEdit(null)} onChange={(e) => done(e.target.value)} />);
    if (f.type === "dateTime") return (
      <input type="datetime-local" autoFocus defaultValue={v ? String(v).slice(0, 16) : ""}
        onBlur={() => setCellEdit(null)} onChange={(e) => done(e.target.value)} />);
    if (NUMY.indexOf(f.type) >= 0) return (
      <input type="number" step="any" autoFocus defaultValue={v ?? ""} onBlur={(e) => done(e.target.value)} />);
    if (f.type === "multilineText" || f.type === "richText") return (
      <textarea autoFocus defaultValue={strip(v)} style={{ minHeight: 90 }} onBlur={(e) => done(e.target.value)} />);
    return <input type="text" autoFocus defaultValue={v ?? ""} onBlur={(e) => done(e.target.value)} />;
  }

  async function save(id: number) {
    const r = await fetch("/api/mirror/" + boardKey + "/" + id, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: draft }),
    });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setEditing(null); load();
  }
  async function create() {
    const r = await fetch("/api/mirror/" + boardKey, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: form }),
    });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setForm({}); setAdding(false);
    setMsg({ kind: "ok", text: "Added. It reaches Airtable at the next sync." });
    load();
  }
  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/sync/mirror/" + boardKey, { method: "POST" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const bits = [`Pulled ${j.pulled} from Airtable`, `sent ${j.pushed_new} new and ${j.pushed_upd} updates`];
      if (j.not_sent) bits.push(`${j.not_sent} refused by Airtable`);
      setMsg({ kind: j.not_sent ? "warn" : "ok", text: bits.join(", ") + "." + (j.problems?.length ? " " + j.problems[0] : "") });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setSyncing(false);
  }

  function show(f: Field, v: any) {
    if (v === null || v === undefined || v === "") {
      if (clientUpdateField && f.id === clientUpdateField.id)
        return <span className="stale bad">never<span className="staleage">no update</span></span>;
      return <span className="muted">-</span>;
    }
    if (f.type === "checkbox") return v ? "Yes" : <span className="muted">No</span>;
    if (f.type === "singleSelect") return <Chip v={v} colors={colorsFor(f)} />;
    if (f.type === "multipleSelects") return <Chip v={Array.isArray(v) ? v.join(", ") : v} colors={colorsFor(f)} />;
    if (f.type === "date" || f.type === "dateTime") {
      const txt = f.type === "date" ? String(v).slice(0, 10) : when(v);
      if (clientUpdateField && f.id === clientUpdateField.id) {
        const d = daysSince(v);
        if (d >= STALE_DAYS) return <span className={"stale" + (d >= STALE_DAYS * 2 ? " bad" : "")}>{txt}<span className="staleage">{d} days</span></span>;
      }
      return txt;
    }
    if (f.type === "lastModifiedTime" || f.type === "createdTime") return when(v);
    if (f.type === "url") return <a href={String(v)} target="_blank" rel="noreferrer" className="filelink" title={String(v)}>{labelFor(String(v))}</a>;
    if (f.type === "multipleRecordLinks") return <span className="muted small">{(v as any[]).length} linked</span>;
    if (f.type === "multipleAttachments") return <span className="muted small">{(v as any[]).length} file(s)</span>;
    if (v && typeof v === "object") return <span className="small">{strip(v.name || JSON.stringify(v))}</span>;
    if (Array.isArray(v)) return <span className="small">{v.map((x) => (x && typeof x === "object" ? x.name : x)).join(", ")}</span>;
    if (NUMY.indexOf(f.type) >= 0) return <span className="money">{String(v)}</span>;
    const t = strip(v);
    return <div className="cellclip" title={t.length > 90 ? t : undefined}><Linkify text={t} /></div>;
  }

  function input(f: Field, val: any, set: (v: any) => void) {
    if (f.type === "checkbox") return <input type="checkbox" checked={!!val} onChange={(e) => set(e.target.checked)} />;
    if (f.type === "singleSelect") return (
      <select value={val ?? ""} onChange={(e) => set(e.target.value)}>
        <option value="">-</option>
        {(f.choices || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>);
    if (f.type === "multipleSelects") return (
      <MultiSelect label="" allLabel="None" options={(f.choices || []).map((c) => c.name)}
        value={Array.isArray(val) ? val : val ? [val] : []} onChange={(v) => set(v)} />);
    if (f.type === "date") return <input type="date" value={val ? String(val).slice(0, 10) : ""} onChange={(e) => set(e.target.value)} />;
    if (f.type === "dateTime") return <input type="datetime-local" value={val ? String(val).slice(0, 16) : ""} onChange={(e) => set(e.target.value)} />;
    if (NUMY.indexOf(f.type) >= 0) return <input type="number" step="any" value={val ?? ""} onChange={(e) => set(e.target.value)} />;
    if (f.type === "multilineText" || f.type === "richText") return <textarea value={strip(val)} onChange={(e) => set(e.target.value)} />;
    return <input type="text" value={val ?? ""} onChange={(e) => set(e.target.value)} />;
  }

  // Which comparisons make sense for a field type.
  function opsFor(f: Field): [string, string][] {
    const base: [string, string][] = [["empty", "is empty"], ["notempty", "is not empty"]];
    if (f.type === "singleSelect" || f.type === "multipleSelects")
      return [["eq", "is any of"], ["nin", "is none of"], ...base];
    if (f.type === "checkbox") return [["bool", "is"]];
    if (DATEY.indexOf(f.type) >= 0)
      return [["stale", "not updated in (days)"], ["fresh", "updated in the last (days)"],
              ["gte", "on or after"], ["lte", "on or before"], ...base];
    if (NUMY.indexOf(f.type) >= 0) return [["gte", "at least"], ["lte", "at most"], ...base];
    return [["has", "contains"], ["nhas", "does not contain"], ...base];
  }
  function defaultOp(f: Field) { return opsFor(f)[0][0]; }
  function defaultVal(op: string) { return op === "eq" || op === "nin" ? [] : op === "bool" ? "true" : op === "stale" || op === "fresh" ? "14" : ""; }

  function addCond(f: Field) {
    const op = defaultOp(f);
    setConds([...conds, { fid: f.id, op, val: defaultVal(op) }]);
    setPage(1);
  }
  function setOp(i: number, op: string) {
    const next = [...conds];
    next[i] = { ...next[i], op, val: defaultVal(op) };
    setConds(next); setPage(1);
  }
  function setVal(i: number, val: any) {
    const next = [...conds];
    next[i] = { ...next[i], val };
    setConds(next); setPage(1);
  }
  // Used by the Open / Closed chips.
  function setCond(fid: string, op: string, val: any) {
    const rest = conds.filter((c) => c.fid !== fid);
    setConds(val === "" ? rest : [...rest, { fid, op, val }]);
  }

  function condInput(c: Cond, i: number, f: Field) {
    if (c.op === "empty" || c.op === "notempty") return <div className="muted small" style={{ paddingTop: 20 }}>&nbsp;</div>;
    if (c.op === "eq" || c.op === "nin") return (
      <MultiSelect label="Value" allLabel="Any" options={(f.choices || []).map((x) => x.name)}
        value={Array.isArray(c.val) ? c.val : []} onChange={(v) => setVal(i, v)} />);
    if (c.op === "stale" || c.op === "fresh") return (
      <><label className="f">Days</label>
        <input type="number" min={0} value={c.val ?? "14"} onChange={(e) => setVal(i, e.target.value)} /></>);
    if (c.op === "bool") return (
      <><label className="f">Value</label>
        <select value={String(c.val)} onChange={(e) => setVal(i, e.target.value)}>
          <option value="true">Ticked</option><option value="false">Not ticked</option>
        </select></>);
    if (c.op === "gte" || c.op === "lte") {
      const numeric = NUMY.indexOf(f.type) >= 0;
      return (<><label className="f">Value</label>
        <input type={numeric ? "number" : "date"} step={numeric ? "any" : undefined}
          value={c.val ?? ""} onChange={(e) => setVal(i, e.target.value)} /></>);
    }
    return (<><label className="f">Text</label>
      <input type="search" value={c.val ?? ""} onChange={(e) => setVal(i, e.target.value)} placeholder="contains" /></>);
  }

  const clientUpdateField = fields.find((f) => DATEY.indexOf(f.type) >= 0 && /updated\s*(for|to)\s*client/i.test(f.name));
  const closedField = fields.find((f) => f.type === "checkbox" && f.name.trim().toLowerCase() === "closed");
  const closedPick = closedField ? String(conds.find((c) => c.fid === closedField.id)?.val ?? "") : "";

  // Anything worth grouping by: selects, ticks, dates and plain text.
  const GROUPABLE = ["singleSelect", "multipleSelects", "checkbox", "singleLineText",
    "date", "dateTime", "lastModifiedTime", "createdTime", "formula", "multipleLookupValues"];
  const GROUPS: GroupDef[] = fields
    .filter((f) => GROUPABLE.indexOf(f.type) >= 0)
    .map((f) => ({
      id: f.id,
      label: f.name,
      keyOf: (r: any) => {
        const v = r.data?.[f.id];
        if (f.type === "checkbox") return v ? "Yes" : "No";
        if (f.type === "date" || f.type === "dateTime" || f.type === "lastModifiedTime" || f.type === "createdTime")
          return String(v ?? "").slice(0, 7);
        if (Array.isArray(v)) return v.map((x: any) => (x && typeof x === "object" ? x.name : x)).join(", ");
        if (v && typeof v === "object") return String(v.name ?? "");
        return String(v ?? "");
      },
    }));
  const groupDef = GROUPS.find((g) => g.id === groupId) || null;
  const groups = buildGroups(rows, groupDef);

  const cols = shown.map((id) => byId.get(id)!).filter(Boolean);
  const linksBoards = boardKey === "status";
  const span = cols.length + 2 + (linksBoards ? 1 : 0);
  const editable = fields.filter((f) => f.writable);

  // Which of this board's own writable fields can be set on a batch. Long text
  // is left out on purpose: pasting the same paragraph onto many records is
  // almost never what someone means.
  const BULK_KINDS: Record<string, BulkField["kind"]> = {
    checkbox: "checkbox", number: "number", currency: "number", percent: "number",
    duration: "number", rating: "number", date: "date", dateTime: "date",
  };
  const BULK_FIELDS: BulkField[] = editable
    .filter((f) => f.type !== "multilineText" && f.type !== "richText")
    .map((f) => (f.choices && f.choices.length
      ? { id: f.id, label: f.name, options: f.choices.map((c) => c.name), clearable: true }
      : { id: f.id, label: f.name, kind: BULK_KINDS[f.type] || "text" }));

  async function bulkApply(fieldId: string, value: any) {
    setBulking(true); setMsg(null);
    try {
      const r = await fetch("/api/mirror/" + boardKey + "/bulk", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: pick.sel, data: { [fieldId]: value } }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const label = BULK_FIELDS.find((f) => f.id === fieldId)?.label || fieldId;
      setMsg({ kind: "ok", text: `${label} set on ${j.updated} ${j.updated === 1 ? "record" : "records"}. They go to Airtable at the next sync.` });
      pick.clear();
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBulking(false);
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pickerList = term ? fields.filter((f) => f.name.toLowerCase().indexOf(term.toLowerCase()) >= 0) : fields;

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="case">
        <h2>Saved views</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            <button className={"chip " + (isBlank ? "on" : "")} onClick={() => applyView({})}>Everything</button>
            {views.map((v) => (
              <span key={v.id} className="viewchip">
                <button className={"chip " + (sameAs(v.params) ? "on" : "")} title={v.owner ? "Saved by " + v.owner : ""}
                  onClick={() => applyView(v.params)}>{v.name}</button>
                <button className="x" title={"Delete " + v.name} onClick={() => deleteView(v)}>&times;</button>
              </span>
            ))}
            {views.length === 0 ? <span className="muted small">Set filters below, then save them here as a button.</span> : null}
          </div>
          <div className="spacer" />
          {naming ? (
            <div className="row">
              <input type="text" autoFocus value={viewName} maxLength={40} placeholder="e.g. Open in Gwinnett"
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") { setNaming(false); setViewName(""); } }}
                style={{ width: 180 }} />
              <button className="btn primary sm" onClick={saveView}>Save</button>
              <button className="btn ghost sm" onClick={() => { setNaming(false); setViewName(""); }}>Cancel</button>
            </div>
          ) : (
            <button className="btn sm" onClick={() => setNaming(true)}>Save these filters</button>
          )}
        </div>
      </div>

      <div className="card noprint" data-tone="case">
        <div className="row">
          <h2 style={{ margin: 0 }}>Filters</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setAdding(!adding)}>{adding ? "Close" : "New " + singular}</button>
        </div>
        {adding ? (
          <>
            <div className="grid g4" style={{ marginTop: 9 }}>
              {editable.slice(0, 8).map((f) => (
                <div key={f.id}><label className="f">{f.name}</label>{input(f, form[f.id], (v) => setForm({ ...form, [f.id]: v }))}</div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 9 }}>
              <button className="btn primary sm" onClick={create}>Save</button>
              <div className="spacer" />
              <span className="muted small">Fill the rest in after it appears, or in Airtable.</span>
            </div>
          </>
        ) : null}
        <div className="row" style={{ marginTop: 9 }}>
          <div style={{ flex: 1 }}><label className="f">Search everything</label>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, note, anything" /></div>
          {clientUpdateField ? (
            <div className="chips" style={{ marginTop: 0, alignSelf: "flex-end", paddingBottom: 2 }}>
              <button className={"chip " + (conds.some((c) => c.fid === clientUpdateField.id && c.op === "stale") ? "on" : "")}
                title={"Cases where " + clientUpdateField.name + " is over two weeks old or never set"}
                onClick={() => {
                  const on = conds.some((c) => c.fid === clientUpdateField.id && c.op === "stale");
                  setConds(on ? conds.filter((c) => !(c.fid === clientUpdateField.id && c.op === "stale"))
                    : [...conds, { fid: clientUpdateField.id, op: "stale", val: String(STALE_DAYS) }]);
                  setPage(1);
                }}>Client update overdue</button>
            </div>
          ) : null}
          {closedField ? (
            <div className="chips" style={{ marginTop: 0, alignSelf: "flex-end", paddingBottom: 2 }}>
              {[["", "All"], ["false", "Open"], ["true", "Closed"]].map(([v, lab]) => (
                <button key={lab} className={"chip " + (closedPick === v ? "on" : "")}
                  onClick={() => { setCond(closedField.id, "bool", v); setPage(1); }}>{lab}</button>
              ))}
            </div>
          ) : null}
        </div>

        {conds.map((c, i) => {
          const f = byId.get(c.fid);
          if (!f) return null;
          return (
            <div className="row filterrow" key={c.fid + i}>
              <div style={{ minWidth: 150 }}><label className="f">{f.name}</label>
                <select value={c.op} onChange={(e) => setOp(i, e.target.value)}>
                  {opsFor(f).map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>{condInput(c, i, f)}</div>
              <button className="btn ghost sm" title="Remove this filter"
                onClick={() => { setConds(conds.filter((_, k) => k !== i)); setPage(1); }}>&times;</button>
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 9 }}>
          <div className="ms" ref={addBox}>
            <button className="btn sm" onClick={() => setAddOpen(!addOpen)}>Add a filter</button>
            {addOpen ? (
              <div className="mspanel">
                <input type="search" autoFocus placeholder="Find a field..." value={addTerm} onChange={(e) => setAddTerm(e.target.value)} />
                <div className="mslist">
                  {fields.filter((f) => !addTerm || f.name.toLowerCase().indexOf(addTerm.toLowerCase()) >= 0).map((f) => (
                    <div key={f.id} className="msitem" onClick={() => { addCond(f); setAddOpen(false); setAddTerm(""); }}>
                      <span>{f.name}</span>
                      <span className="muted small" style={{ marginLeft: "auto" }}>{f.type.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {conds.length || q ? (
            <button className="btn sm" onClick={() => { setConds([]); setQ(""); setPage(1); }}>Clear all</button>
          ) : null}
          <div className="spacer" />
          <span className="muted small">{conds.length ? conds.length + " filter" + (conds.length > 1 ? "s" : "") : "No filters"}</span>
        </div>
      </div>

      <div className="card" data-tone="case">
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats"><div className="stat"><b>{total.toLocaleString()}</b><span>{label}</span></div></div>
          <div className="spacer" />
          <div className="row noprint">
            <div className="ms" ref={pickerBox}>
              <button className="btn sm" onClick={() => setPicker(!picker)}>Columns ({cols.length}/{fields.length})</button>
              {picker ? (
                <div className="mspanel" style={{ right: 0, left: "auto" }}>
                  <input type="search" autoFocus placeholder="Find a field..." value={term} onChange={(e) => setTerm(e.target.value)} />
                  <div className="msrow">
                    <button className="btn ghost sm" onClick={() => persist(pickerList.map((f) => f.id))}>Show all</button>
                    <button className="btn ghost sm" onClick={() => { persist(fields.slice(0, 8).map((f) => f.id)); cw.reset(); }}>Reset</button>
                    <div className="spacer" />
                    <button className="btn ghost sm" onClick={() => setPicker(false)}>Done</button>
                  </div>
                  <div className="mslist">
                    {pickerList.map((f) => (
                      <label key={f.id} className="msitem">
                        <input type="checkbox" checked={shown.indexOf(f.id) >= 0} onChange={() => toggleCol(f.id)} />
                        <span>{f.name}</span>
                        {!f.writable ? <span className="muted small" style={{ marginLeft: "auto" }}>read only</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <RowSize />
            <span className="muted small">Click a cell to change it.</span>
            <GroupPicker defs={GROUPS} value={groupId} onChange={(v) => { setGroupId(v); setFolded({}); }} />
            {cw.sized ? <button className="btn sm" onClick={cw.reset}>Reset widths</button> : null}
            <button className="btn sm" onClick={() => window.print()}>Print / PDF</button>
            <SyncButton busy={syncing} onClick={syncNow} syncKey={boardKey} />
          </div>
        </div>

        <BulkBar count={pick.count} fields={BULK_FIELDS} busy={bulking} noun="records"
          onApply={bulkApply} onClear={pick.clear} />

        <div className="tablewrap">
          <table className={"data" + (cw.sized ? " sized" : "")}>
            <thead><tr>
              <SelectAllTh ids={rows.map((r) => r.id)} sel={pick.sel} setAll={pick.setAll} />
              {cols.map((f) => (
                <th key={f.id} style={cw.widthOf(f.id)} className={"sortable" + (overId === f.id ? " over" : "") + (dragId === f.id ? " dragging" : "")}
                    draggable
                    onDragStart={() => { dragged.current = true; setDragId(f.id); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); setTimeout(() => { dragged.current = false; }, 60); }}
                    onDragOver={(e) => { e.preventDefault(); setOverId(f.id); }}
                    onDragLeave={() => setOverId((v) => (v === f.id ? null : v))}
                    onDrop={(e) => { e.preventDefault(); drop(f.id); setOverId(null); }}
                    onClick={() => sortBy(f.id)}>
                  <span className="grip">⠿</span>{f.name}
                  <span className="caret">{sort === f.id ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                  <Resizer onDown={(e) => cw.start(e, f.id)} />
                </th>
              ))}
              {linksBoards ? <th className="noprint" style={{ width: 92 }}>Client board</th> : null}
              <th className="noprint" style={{ width: 62 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={span} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={span} className="muted">Nothing matches. If this board is empty, press Sync Airtable.</td></tr>)
: groups.map((g) => (
                <Fragment key={"g" + g.key}>
                  {groupDef ? (
                    <GroupRow label={g.key} count={g.items.length} span={span}
                      collapsed={!!folded[g.key]} onToggle={() => setFolded({ ...folded, [g.key]: !folded[g.key] })} />
                  ) : null}
                  {folded[g.key] ? null : g.items.map((r) => editing === r.id ? (
                <tr key={r.id}><td colSpan={span}>
                  <div className="grid g4">
                    {editable.map((f) => (
                      <div key={f.id}><label className="f">{f.name}</label>
                        {input(f, draft[f.id], (v) => setDraft({ ...draft, [f.id]: v }))}</div>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 9 }}>
                    <button className="btn primary sm" onClick={() => save(r.id)}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                    <div className="spacer" />
                    <span className="muted small">Changes reach Airtable at the next sync. Formulas and rollups are not shown here because Airtable works them out.</span>
                  </div>
                </td></tr>
              ) : (
                <tr key={r.id} className={pick.has(r.id) ? "picked" : ""}>
                  <SelectTd id={r.id} has={pick.has} toggle={pick.toggle} />
                  {cols.map((f) => {
                    const open = cellEdit?.id === r.id && cellEdit.fid === f.id;
                    if (!f.writable) return <td key={f.id} className="small">{show(f, r.data?.[f.id])}</td>;
                    // Ticks toggle straight away; everything else opens on click.
                    if (f.type === "checkbox") return (
                      <td key={f.id} className="small tick">
                        <input type="checkbox" checked={!!r.data?.[f.id]}
                          onChange={(e) => saveCell(r, f, e.target.checked)} />
                      </td>);
                    return (
                      <td key={f.id} className="small edit"
                        onClick={() => { if (!open) setCellEdit({ id: r.id, fid: f.id }); }}>
                        {open ? inlineCell(f, r) : show(f, r.data?.[f.id])}
                      </td>);
                  })}
                  {linksBoards ? (
                    <td className="noprint">
                      {boardMap[String(r.data?.[primary] ?? "").trim().toLowerCase()]
                        ? <a className="btn ghost sm" href={"/boards/" + boardMap[String(r.data?.[primary] ?? "").trim().toLowerCase()]}>Open</a>
                        : <span className="muted small">-</span>}
                    </td>
                  ) : null}
                  <td className="noprint">
                    <button className="btn ghost sm" onClick={() => { setEditing(r.id); setDraft({ ...(r.data || {}) }); }}>Edit</button>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="row noprint" style={{ marginTop: 9 }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
