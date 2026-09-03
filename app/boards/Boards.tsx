"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Resizer, useColWidths } from "../colwidths";
import RowSize from "../RowSize";
import SyncButton from "../SyncButton";

type Board = {
  id: number; base_id: string; label: string; case_name: string | null; note: string | null;
  last_sync: string | null; last_result: string | null; rows: number; added_at: string;
  tables?: number; open_items?: number | null; files?: number | null;
  last_activity?: string | null; update_text?: string | null; update_at?: string | null;
};
type Tbl = { id: string; name: string; rows: number };

const when = (v: any) => {
  if (!v) return "";
  const t = new Date(v);
  if (isNaN(t.getTime())) return "";
  const m = String(t.getMinutes()).padStart(2, "0");
  return `${t.getMonth() + 1}/${t.getDate()}/${String(t.getFullYear()).slice(2)} ${t.getHours() % 12 || 12}:${m} ${t.getHours() >= 12 ? "PM" : "AM"}`;
};

const COLUMNS: { id: string; label: string; width?: number }[] = [
  { id: "label", label: "Board", width: 210 },
  { id: "case_name", label: "Case", width: 190 },
  { id: "update_text", label: "Latest client update" },
  { id: "open_items", label: "Open items", width: 96 },
  { id: "files", label: "Files", width: 78 },
  { id: "tables", label: "Tables", width: 82 },
  { id: "rows", label: "Rows", width: 84 },
  { id: "last_activity", label: "Last activity", width: 132 },
  { id: "last_sync", label: "Last sync", width: 132 },
  { id: "last_result", label: "Sync result", width: 180 },
  { id: "note", label: "Note", width: 170 },
  { id: "base_id", label: "Base id", width: 155 },
  { id: "added_at", label: "Added", width: 132 },
];
const DEFAULT_COLS = ["label", "case_name", "update_text", "open_items", "files", "last_activity"];
// Bumped when the column set changes, so a saved layout does not hide new columns.
const LAYOUT = "efl.boards.columns.v2";

type FDef = { id: string; label: string; kind: "text" | "num" | "date" };
const FILTERS: FDef[] = [
  { id: "label", label: "Board name", kind: "text" },
  { id: "case_name", label: "Case", kind: "text" },
  { id: "update_text", label: "Latest client update", kind: "text" },
  { id: "note", label: "Note", kind: "text" },
  { id: "open_items", label: "Open items", kind: "num" },
  { id: "files", label: "Files", kind: "num" },
  { id: "rows", label: "Rows", kind: "num" },
  { id: "tables", label: "Tables", kind: "num" },
  { id: "last_activity", label: "Last activity", kind: "date" },
  { id: "last_sync", label: "Last sync", kind: "date" },
  { id: "added_at", label: "Added", kind: "date" },
];
type Cond = { id: string; op: string; val: string };

function opsFor(k: string): [string, string][] {
  const base: [string, string][] = [["empty", "is empty"], ["notempty", "is not empty"]];
  if (k === "num") return [["gte", "at least"], ["lte", "at most"], ...base];
  if (k === "date") return [["gte", "on or after"], ["lte", "on or before"], ...base];
  return [["has", "contains"], ["not", "does not contain"], ...base];
}

function passes(b: any, c: Cond, kind: string): boolean {
  const v = (b as any)[c.id];
  const blank = v === null || v === undefined || v === "";
  if (c.op === "empty") return blank;
  if (c.op === "notempty") return !blank;
  if (c.val === "" || c.val === undefined) return true;
  if (kind === "num") {
    const n = Number(v ?? 0), t = Number(c.val);
    return c.op === "gte" ? n >= t : n <= t;
  }
  if (kind === "date") {
    if (blank) return false;
    const n = new Date(v).getTime(), t = new Date(c.val).getTime();
    return c.op === "gte" ? n >= t : n <= t;
  }
  const hay = String(v ?? "").toLowerCase(), needle = c.val.toLowerCase();
  return c.op === "not" ? hay.indexOf(needle) < 0 : hay.indexOf(needle) >= 0;
}

const GROUPS: { id: string; label: string }[] = [
  { id: "", label: "No grouping" },
  { id: "case", label: "Group by case" },
  { id: "letter", label: "Group by first letter" },
  { id: "state", label: "Group by sync state" },
  { id: "activity", label: "Group by activity" },
];

export default function Boards() {
  const [rows, setRows] = useState<Board[]>([]);
  const [cases, setCases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ url: "", label: "", case_name: "" });
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [conds, setConds] = useState<Cond[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const addBox = useRef<HTMLDivElement>(null);
  const [views, setViews] = useState<any[]>([]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [sort, setSort] = useState("label");
  const [dir, setDir] = useState("asc");

  const [shown, setShown] = useState<string[]>(DEFAULT_COLS);
  const [picker, setPicker] = useState(false);
  const pickerBox = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragged = useRef(false);
  const cw = useColWidths("efl.boards.widths");

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [tables, setTables] = useState<Record<string, Tbl[]>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fullText, setFullText] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) setShown(saved.filter((c: any) => COLUMNS.some((x) => x.id === c)));
      }
    } catch {}
    try { setFullText(localStorage.getItem("efl.boards.fulltext") !== "0"); } catch {}
  }, []);
  function persist(next: string[]) {
    setShown(next);
    try { localStorage.setItem(LAYOUT, JSON.stringify(next)); } catch {}
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch("/api/client-boards")).json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/cases?limit=1000").then((r) => r.json()).then((j) => setCases(j.cases || [])).catch(() => {});
  }, []);

  const loadViews = useCallback(() => {
    fetch("/api/views?page=boards").then((r) => r.json())
      .then((j) => { if (!j.error) setViews(j.rows || []); }).catch(() => {});
  }, []);
  useEffect(() => { loadViews(); }, [loadViews]);

  const current = useMemo(() => ({ q, conds, group, sort, dir }), [q, conds, group, sort, dir]);
  const isBlank = q === "" && conds.length === 0 && group === "";
  const sameAs = (p: any) => JSON.stringify({ q: p?.q ?? "", conds: p?.conds ?? [], group: p?.group ?? "", sort: p?.sort ?? "label", dir: p?.dir ?? "asc" }) === JSON.stringify(current);
  function applyView(p: any) {
    setQ(p?.q ?? ""); setConds(Array.isArray(p?.conds) ? p.conds : []);
    setGroup(p?.group ?? ""); setSort(p?.sort ?? "label"); setDir(p?.dir ?? "asc");
  }
  async function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const dupe = views.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (dupe && !confirm('A view called "' + dupe.name + '" already exists. Replace it?')) return;
    const j = await (await fetch("/api/views", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "boards", name, params: current }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setNaming(false); setViewName(""); loadViews();
  }
  async function deleteView(v: any) {
    if (!confirm('Delete the saved view "' + v.name + '"?')) return;
    const j = await (await fetch("/api/views/" + v.id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    loadViews();
  }

  function addCond(f: FDef) {
    setConds([...conds, { id: f.id, op: opsFor(f.kind)[0][0], val: "" }]);
  }

  async function importFromClients() {
    setBusy("import");
    try {
      const j = await (await fetch("/api/client-boards/import", { method: "POST" })).json();
      if (j.error) throw new Error(j.error);
      const bits = [`Read ${j.seen} clients`, `${j.added} added`, `${j.updated} renamed`];
      if (j.no_base) bits.push(`${j.no_base} without a base id`);
      setMsg({ kind: "ok", text: bits.join(", ") + "." });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy("");
  }

  async function add() {
    if (!form.url.trim()) { setMsg({ kind: "err", text: "Paste one or more Airtable links." }); return; }
    setBusy("add");
    try {
      const j = await (await fetch("/api/client-boards", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      })).json();
      if (j.error) throw new Error(j.error);
      const bits = [`Added ${j.added.length}`];
      if (j.skipped?.length) bits.push(`${j.skipped.length} already on the list`);
      if (j.failed?.length) bits.push(`${j.failed.length} the token cannot read`);
      setMsg({ kind: j.failed?.length ? "warn" : "ok", text: bits.join(", ") + "." });
      setForm({ url: "", label: "", case_name: "" });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy("");
  }

  async function loadTables(b: Board) {
    if (tables[b.base_id]) return;
    try {
      const j = await (await fetch("/api/client-boards/" + b.base_id)).json();
      if (j.error) throw new Error(j.error);
      setTables((t) => ({ ...t, [b.base_id]: j.tables || [] }));
    } catch (e: any) { setMsg({ kind: "err", text: b.label + ": " + e.message }); }
  }
  function toggle(b: Board) {
    const next = !open[b.base_id];
    setOpen({ ...open, [b.base_id]: next });
    if (next) loadTables(b);
  }

  async function syncBoard(b: Board) {
    setBusy(b.base_id);
    try {
      const j = await (await fetch("/api/client-boards/" + b.base_id)).json();
      if (j.error) throw new Error(j.error);
      let pulled = 0;
      for (const t of j.tables || []) {
        const r = await (await fetch("/api/sync/mirror/b:" + b.base_id + ":" + t.id, { method: "POST" })).json();
        if (!r.error) pulled += r.pulled || 0;
      }
      setMsg({ kind: "ok", text: `${b.label}: ${pulled.toLocaleString()} rows across ${(j.tables || []).length} tables.` });
      setTables((t) => { const n = { ...t }; delete n[b.base_id]; return n; });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: b.label + ": " + e.message }); }
    setBusy("");
  }

  async function syncAll() {
    setBusy("all");
    let done = 0;
    for (const b of rows) {
      try {
        const j = await (await fetch("/api/client-boards/" + b.base_id)).json();
        for (const t of j.tables || []) {
          await fetch("/api/sync/mirror/b:" + b.base_id + ":" + t.id, { method: "POST" });
        }
        done++;
        setMsg({ kind: "ok", text: `Synced ${done} of ${rows.length} boards...` });
      } catch {}
    }
    setMsg({ kind: "ok", text: `Synced ${done} of ${rows.length} boards.` });
    setTables({}); setBusy(""); load();
  }

  async function rename(b: Board) {
    const j = await (await fetch("/api/client-boards/" + b.base_id, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ renameFromAirtable: true }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setMsg({ kind: "ok", text: j.label ? `Renamed to "${j.label}".` : "Airtable did not give a name for that base." });
    load();
  }

  async function remove(b: Board) {
    if (!confirm(`Remove "${b.label}" and delete its ${b.rows.toLocaleString()} mirrored rows? Airtable is not touched.`)) return;
    const j = await (await fetch("/api/client-boards/" + b.base_id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  const cols = shown.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = t ? rows.filter((b) =>
      [b.label, b.case_name, b.note, b.base_id, b.update_text].some((v) => String(v || "").toLowerCase().indexOf(t) >= 0)) : rows;
    for (const c of conds) {
      const def = FILTERS.find((f) => f.id === c.id);
      if (!def) continue;
      list = list.filter((b) => passes(b, c, def.kind));
    }
    const val = (b: Board) => String((b as any)[sort] ?? "").toLowerCase();
    const NUM = ["rows", "tables", "open_items", "files"];
    return [...list].sort((a, b) => {
      const s = dir === "asc" ? 1 : -1;
      if (NUM.indexOf(sort) >= 0) return s * ((Number((a as any)[sort]) || 0) - (Number((b as any)[sort]) || 0));
      if (sort === "last_activity" || sort === "last_sync" || sort === "added_at")
        return s * (new Date((a as any)[sort] || 0).getTime() - new Date((b as any)[sort] || 0).getTime());
      return s * val(a).localeCompare(val(b));
    });
  }, [rows, q, conds, sort, dir]);

  const grouped = useMemo(() => {
    if (!group) return [{ key: "", items: filtered }];
    const map = new Map<string, Board[]>();
    for (const b of filtered) {
      const k = group === "case" ? (b.case_name || "Not linked to a case")
        : group === "letter" ? (b.label?.[0] || "?").toUpperCase()
        : group === "activity" ? (() => {
            if (!b.last_activity) return "No activity";
            const days = (Date.now() - new Date(b.last_activity).getTime()) / 86400000;
            return days < 7 ? "This week" : days < 30 ? "This month" : days < 90 ? "Last 3 months" : "Older";
          })()
        : b.last_sync ? "Synced" : "Never synced";
      map.set(k, [...(map.get(k) || []), b]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => ({ key, items }));
  }, [filtered, group]);

  function sortBy(id: string) {
    if (dragged.current) return;
    if (sort === id) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(id); setDir("asc"); }
  }
  function drop(target: string) {
    if (!dragId || dragId === target) return;
    const next = shown.filter((c) => c !== dragId);
    next.splice(next.indexOf(target), 0, dragId);
    persist(next);
  }

  function cell(id: string, b: Board) {
    switch (id) {
      case "label": return <td key={id}>
        <button className="twist" title={open[b.base_id] ? "Collapse" : "Show tables"} onClick={() => toggle(b)}>{open[b.base_id] ? "▾" : "▸"}</button>
        <a href={"/boards/" + b.base_id}><b>{b.label}</b></a>
      </td>;
      case "case_name": return <td key={id}>{b.case_name
        ? <a href={"/cases?q=" + encodeURIComponent(b.case_name)}>{b.case_name}</a>
        : <span className="muted">not linked</span>}</td>;
      case "rows": return <td key={id} className="money">{b.rows.toLocaleString()}</td>;
      case "tables": return <td key={id} className="money">{b.tables ? b.tables : <span className="muted">-</span>}</td>;
      case "open_items": return <td key={id} className="money">
        {b.open_items === null || b.open_items === undefined ? <span className="muted">-</span>
          : b.open_items === 0 ? <span className="muted">0</span>
          : <b className={b.open_items > 9 ? "hot" : ""}>{b.open_items}</b>}</td>;
      case "files": return <td key={id} className="money">{b.files ? b.files.toLocaleString() : <span className="muted">-</span>}</td>;
      case "last_activity": return <td key={id} className="date small">{b.last_activity ? when(b.last_activity) : <span className="muted">-</span>}</td>;
      case "update_text": {
        if (!b.update_text)
          return <td key={id} className="small"><span className="muted">{b.rows ? "no client update" : "not synced yet"}</span></td>;
        const open = fullText || expanded[b.base_id];
        const long = b.update_text.length > 240;
        return <td key={id} className="small">
          {b.update_at ? <div className="muted small" style={{ marginBottom: 3 }}>{when(b.update_at)}</div> : null}
          <div className={"upd" + (open ? " open" : "")}>{b.update_text}</div>
          {long && !fullText ? (
            <button className="updmore" onClick={() => setExpanded({ ...expanded, [b.base_id]: !expanded[b.base_id] })}>
              {expanded[b.base_id] ? "Show less" : "Show more"}
            </button>
          ) : null}
        </td>;
      }
      case "last_sync": return <td key={id} className="date small">{b.last_sync ? when(b.last_sync) : <span className="muted">never</span>}</td>;
      case "last_result": return <td key={id} className="small muted">{b.last_result || ""}</td>;
      case "note": return <td key={id} className="small muted">{b.note || ""}</td>;
      case "base_id": return <td key={id} className="small muted">{b.base_id}</td>;
      case "added_at": return <td key={id} className="date small">{when(b.added_at)}</td>;
      default: return <td key={id} />;
    }
  }

  const span = cols.length + 1;

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="board">
        <h2>Add client boards</h2>
        <div className="grid g4">
          <div style={{ gridColumn: "span 2" }}><label className="f">Airtable links</label>
            <textarea value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="Paste one link, or many at once, one per line" style={{ minHeight: 60 }} /></div>
          <div><label className="f">Name (single board only)</label>
            <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Blank uses the Airtable base name" /></div>
          <div><label className="f">Case (single board only)</label>
            <input type="text" list="allcases" value={form.case_name} onChange={(e) => setForm({ ...form, case_name: e.target.value })}
              placeholder="Start typing" />
            <datalist id="allcases">{cases.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="row" style={{ marginTop: 9 }}>
          <button className="btn primary sm" disabled={!!busy} onClick={add}>{busy === "add" ? "Checking access..." : "Add"}</button>
          <button className="btn sm" disabled={!!busy} onClick={importFromClients}>
            {busy === "import" ? "Reading Clients..." : "Import from Clients tab"}
          </button>
          <div className="spacer" />
          <span className="muted small">Import names every board from the Clients table and links it to its case.</span>
        </div>
      </div>

      <div className="card noprint" data-tone="board">
        <h2>Saved views and filters</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            <button className={"chip " + (isBlank ? "on" : "")}
              onClick={() => applyView({})}>All boards</button>
            <button className={"chip " + (conds.some((c) => c.id === "open_items" && c.op === "gte" && c.val === "1") ? "on" : "")}
              onClick={() => setConds([{ id: "open_items", op: "gte", val: "1" }])}>Has open items</button>
            <button className={"chip " + (conds.some((c) => c.id === "case_name" && c.op === "empty") ? "on" : "")}
              onClick={() => setConds([{ id: "case_name", op: "empty", val: "" }])}>Not linked to a case</button>
            <button className={"chip " + (conds.some((c) => c.id === "last_sync" && c.op === "empty") ? "on" : "")}
              onClick={() => setConds([{ id: "last_sync", op: "empty", val: "" }])}>Never synced</button>
            <span className="sep" />
            {views.map((v) => (
              <span key={v.id} className="viewchip">
                <button className={"chip " + (sameAs(v.params) ? "on" : "")} title={v.owner ? "Saved by " + v.owner : ""}
                  onClick={() => applyView(v.params)}>{v.name}</button>
                <button className="x" title={"Delete " + v.name} onClick={() => deleteView(v)}>&times;</button>
              </span>
            ))}
          </div>
          <div className="spacer" />
          {naming ? (
            <div className="row">
              <input type="text" autoFocus value={viewName} maxLength={40} placeholder="e.g. Needs attention"
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") { setNaming(false); setViewName(""); } }}
                style={{ width: 175 }} />
              <button className="btn primary sm" onClick={saveView}>Save</button>
              <button className="btn ghost sm" onClick={() => { setNaming(false); setViewName(""); }}>Cancel</button>
            </div>
          ) : (
            <button className="btn sm" onClick={() => setNaming(true)}>Save these filters</button>
          )}
        </div>

        {conds.map((c, i) => {
          const def = FILTERS.find((f) => f.id === c.id);
          if (!def) return null;
          const showValue = c.op !== "empty" && c.op !== "notempty";
          return (
            <div className="row filterrow" key={c.id + i}>
              <div style={{ minWidth: 170 }}><label className="f">{def.label}</label>
                <select value={c.op} onChange={(e) => {
                  const next = [...conds]; next[i] = { ...next[i], op: e.target.value, val: "" }; setConds(next);
                }}>
                  {opsFor(def.kind).map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                {showValue ? (
                  <>
                    <label className="f">Value</label>
                    <input type={def.kind === "num" ? "number" : def.kind === "date" ? "date" : "search"}
                      value={c.val} onChange={(e) => {
                        const next = [...conds]; next[i] = { ...next[i], val: e.target.value }; setConds(next);
                      }} />
                  </>
                ) : <div style={{ paddingTop: 20 }}>&nbsp;</div>}
              </div>
              <button className="btn ghost sm" title="Remove this filter"
                onClick={() => setConds(conds.filter((_, k) => k !== i))}>&times;</button>
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 9 }}>
          <div className="ms" ref={addBox}>
            <button className="btn sm" onClick={() => setAddOpen(!addOpen)}>Add a filter</button>
            {addOpen ? (
              <div className="mspanel">
                <div className="mslist">
                  {FILTERS.map((f) => (
                    <div key={f.id} className="msitem" onClick={() => { addCond(f); setAddOpen(false); }}>
                      <span>{f.label}</span>
                      <span className="muted small" style={{ marginLeft: "auto" }}>{f.kind}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {conds.length || q ? (
            <button className="btn sm" onClick={() => { setConds([]); setQ(""); }}>Clear all</button>
          ) : null}
          <div className="spacer" />
          <span className="muted small">
            {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} boards
            {conds.length ? " · " + conds.length + " filter" + (conds.length > 1 ? "s" : "") : ""}
          </span>
        </div>
      </div>

      <div className="card" data-tone="board">
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats">
            <div className="stat"><b>{rows.length}</b><span>Boards</span></div>
            <div className="stat"><b>{rows.reduce((n, b) => n + (b.open_items || 0), 0).toLocaleString()}</b><span>Open items</span></div>
            <div className="stat"><b>{rows.reduce((n, b) => n + (b.files || 0), 0).toLocaleString()}</b><span>Files</span></div>
            <div className="stat"><b>{rows.reduce((n, b) => n + b.rows, 0).toLocaleString()}</b><span>Rows</span></div>
            <div className="stat"><b>{rows.filter((b) => !b.last_sync).length}</b><span>Never synced</span></div>
          </div>
          <div className="spacer" />
          <div className="row noprint">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a board" style={{ width: 150 }} />
            <RowSize />
            <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 165 }}>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <div className="ms" ref={pickerBox}>
              <button className="btn sm" onClick={() => setPicker(!picker)}>Columns ({cols.length})</button>
              {picker ? (
                <div className="mspanel" style={{ right: 0, left: "auto" }}>
                  <div className="msrow">
                    <button className="btn ghost sm" onClick={() => persist(COLUMNS.map((c) => c.id))}>Show all</button>
                    <button className="btn ghost sm" onClick={() => { persist(DEFAULT_COLS); cw.reset(); }}>Reset</button>
                    <div className="spacer" />
                    <button className="btn ghost sm" onClick={() => setPicker(false)}>Done</button>
                  </div>
                  <div className="mslist">
                    {COLUMNS.map((c) => (
                      <label key={c.id} className="msitem">
                        <input type="checkbox" checked={shown.indexOf(c.id) >= 0}
                          onChange={() => persist(shown.indexOf(c.id) >= 0 ? shown.filter((x) => x !== c.id) : [...shown, c.id])} />
                        <span>{c.label}</span>
                        {shown.indexOf(c.id) < 0 ? <span className="muted small" style={{ marginLeft: "auto" }}>hidden</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button className="btn sm" title="Show client updates in full, or trimmed to a few lines"
              onClick={() => { const v = !fullText; setFullText(v); try { localStorage.setItem("efl.boards.fulltext", v ? "1" : "0"); } catch {} }}>
              {fullText ? "Condense updates" : "Full updates"}
            </button>
            <SyncButton busy={busy === "all"} onClick={syncAll} label="Sync all boards" busyLabel="Syncing all..." syncPrefix="b:" />
          </div>
        </div>

        <div className="tablewrap">
          <table className={"data" + (cw.sized ? " sized" : "")}>
            <thead><tr>
              {cols.map((c) => (
                <th key={c.id} style={cw.widthOf(c.id, c.width)} className="sortable" draggable
                    onDragStart={() => { dragged.current = true; setDragId(c.id); }}
                    onDragEnd={() => { setDragId(null); setTimeout(() => { dragged.current = false; }, 60); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); drop(c.id); }}
                    onClick={() => sortBy(c.id)}>
                  <span className="grip">⠿</span>{c.label}
                  <span className="caret">{sort === c.id ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                  <Resizer onDown={(e) => cw.start(e, c.id)} />
                </th>
              ))}
              <th className="noprint" style={{ width: 190 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={span} className="muted">Loading...</td></tr>)
                : filtered.length === 0 ? (<tr><td colSpan={span} className="muted">No client boards yet. Paste some links above.</td></tr>)
                : grouped.map((g) => (
                <Fragment key={"grp" + g.key}>
                  {g.key ? (
                    <tr key={"g" + g.key} className="grouprow">
                      <td colSpan={span} onClick={() => setCollapsed({ ...collapsed, [g.key]: !collapsed[g.key] })}>
                        <button className="twist">{collapsed[g.key] ? "▸" : "▾"}</button>
                        <b>{g.key}</b> <span className="muted small">({g.items.length})</span>
                      </td>
                    </tr>
                  ) : null}
                  {collapsed[g.key] ? null : g.items.map((b) => (
                    <Fragment key={b.base_id}>
                      <tr key={b.base_id}>
                        {cols.map((c) => cell(c.id, b))}
                        <td className="noprint">
                          <a className="btn ghost sm" href={"/boards/" + b.base_id}>Open</a>
                          <button className="btn ghost sm" disabled={!!busy} onClick={() => syncBoard(b)}>{busy === b.base_id ? "..." : "Sync"}</button>
                          <button className="btn ghost sm" title="Take the name from Airtable" onClick={() => rename(b)}>Rename</button>
                          <button className="btn ghost sm" onClick={() => remove(b)}>Remove</button>
                        </td>
                      </tr>
                      {open[b.base_id] ? (
                        <tr key={b.base_id + "x"} className="expandrow">
                          <td colSpan={span}>
                            {!tables[b.base_id] ? <span className="muted small">Loading tables...</span> : (
                              <div className="chips" style={{ marginTop: 0 }}>
                                {tables[b.base_id].map((t) => (
                                  <a key={t.id} className="chip" href={"/boards/" + b.base_id + "?t=" + t.id}>
                                    {t.name}{t.rows ? " · " + t.rows.toLocaleString() : " · empty"}
                                  </a>
                                ))}
                                {tables[b.base_id].length === 0 ? <span className="muted small">No tables readable in this base.</span> : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
