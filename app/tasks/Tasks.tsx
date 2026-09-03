"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TASK_USERS, prioClass } from "../../lib/constants";
import MultiSelect from "../MultiSelect";
import Chip, { useChoices, useOptions } from "../Chip";
import Linkify, { labelFor } from "../Linkify";
import { Fragment, GroupDef, GroupPicker, GroupRow, buildGroups } from "../group";
import { Resizer, useColWidths } from "../colwidths";
import RowSize from "../RowSize";
import Parade from "../Parade";
import ParadeControls from "../ParadeControls";
import { celebrate } from "../celebrate";
import { seasonFor } from "../../lib/seasons";
import Rules from "./Rules";
import { CF } from "../../lib/constants";
import SyncButton from "../SyncButton";
import BulkBar, { BulkField, SelectAllTh, SelectTd, useSelection } from "../BulkBar";

const d10 = (v: any) => (v ? String(v).slice(0, 10) : "");
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Modified column: a real date AND time, e.g. 8/28/26 3:42 PM.
function when(v: any): string {
  if (!v) return "";
  const t = new Date(v);
  if (isNaN(t.getTime())) return "";
  const y = String(t.getFullYear()).slice(2);
  const mins = String(t.getMinutes()).padStart(2, "0");
  const ap = t.getHours() >= 12 ? "PM" : "AM";
  const h12 = t.getHours() % 12 || 12;
  return `${t.getMonth() + 1}/${t.getDate()}/${y} ${h12}:${mins} ${ap}`;
}
function stamp(v: any): string {
  if (!v) return "";
  const t = new Date(v);
  return isNaN(t.getTime()) ? "" : t.toLocaleString();
}

type View = { id: number; name: string; owner?: string; params: any };

// Saved views created before multi-select held a single string.
const asList = (v: any): string[] =>
  Array.isArray(v) ? [...v].sort() : v ? [String(v)] : [];

const BLANK = { who: "", status: [] as string[], priority: [] as string[], caseQ: "", q: "", showClosed: false, sort: "order", dir: "asc" };

const DEFAULT_DIR: Record<string, string> = {
  order: "asc", priority: "asc", case: "asc", task: "asc",
  status: "asc", who: "asc", due: "asc", modified: "desc", closed: "asc",
};

const QUICK: { name: string; params: any }[] = [
  { name: "RIE open", params: { ...BLANK, who: "RIE" } },
  { name: "KW open", params: { ...BLANK, who: "KW" } },
  { name: "KV open", params: { ...BLANK, who: "KV" } },
  { name: "By due date", params: { ...BLANK, sort: "due", dir: "asc" } },
  { name: "Recently changed", params: { ...BLANK, sort: "modified", dir: "desc" } },
];

// Drag a heading sideways to reorder. Layout is remembered on this computer.
const COLUMNS: { id: string; label: string; width?: number }[] = [
  { id: "closed", label: "Done", width: 54 },
  { id: "priority", label: "Priority", width: 128 },
  { id: "case", label: "Case", width: 180 },
  { id: "task", label: "Task" },
  { id: "status", label: "Status", width: 170 },
  { id: "who", label: "Who", width: 62 },
  { id: "due", label: "Due", width: 88 },
  { id: "link", label: "Link", width: 130 },
  { id: "modified", label: "Modified", width: 132 },
];
const DEFAULT_ORDER = COLUMNS.map((c) => c.id);
const LAYOUT_KEY = "efl.tasks.columns";

export default function Tasks() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<{ statuses: string[]; priorities: string[] }>({ statuses: [], priorities: [] });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const [who, setWho] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [caseQ, setCaseQ] = useState("");
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState("order");
  const [dir, setDir] = useState("asc");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [views, setViews] = useState<View[]>([]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragged = useRef(false);
  const [picker, setPicker] = useState(false);
  const pickerBox = useRef<HTMLDivElement>(null);
  const cw = useColWidths("efl.tasks.widths");

  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [syncing, setSyncing] = useState(false);
  const choices = useChoices();
  // Airtable is the source of the option lists. What is already stored
  // locally is only the fallback, so a status nobody has used yet still
  // appears in the dropdowns.
  const statuses = useOptions(CF.taskStatus, meta.statuses);
  const priorities = useOptions(CF.taskPriority, meta.priorities);
  const whos = useOptions(CF.taskWho, TASK_USERS);
  const pick = useSelection<number>();
  const [bulking, setBulking] = useState(false);
  const BULK_FIELDS: BulkField[] = [
    { id: "status", label: "Status", options: statuses, clearable: true },
    { id: "priority", label: "Priority", options: priorities, clearable: true },
    { id: "who", label: "Who", options: whos, clearable: true },
    { id: "due_date", label: "Due date", kind: "date" },
    { id: "case_name", label: "Case", kind: "text" },
    { id: "client_name", label: "Client", kind: "text" },
    { id: "closed", label: "Closed", kind: "checkbox" },
  ];

  async function bulkApply(fieldId: string, value: any) {
    setBulking(true); setMsg(null);
    try {
      const r = await fetch("/api/tasks/bulk", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: pick.sel, patch: { [fieldId]: value } }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const label = BULK_FIELDS.find((f) => f.id === fieldId)?.label || fieldId;
      const rules = (j.fired || []).length ? " Automations ran: " + j.fired.join("; ") + "." : "";
      setMsg({ kind: "ok", text: `${label} set on ${j.updated} ${j.updated === 1 ? "task" : "tasks"}.${rules} They go to Airtable at the next sync.` });
      pick.clear();
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBulking(false);
  }

  async function bulkDelete() {
    const n = pick.sel.length;
    if (!confirm(`Delete ${n} ${n === 1 ? "task" : "tasks"} from Chambers? Airtable still has them until you delete them there.`)) return;
    setBulking(true); setMsg(null);
    try {
      const r = await fetch("/api/tasks/bulk", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: pick.sel }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Removed ${j.deleted} from Chambers.` });
      pick.clear();
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBulking(false);
  }
  const [leaving, setLeaving] = useState<number | null>(null);
  const [cellEdit, setCellEdit] = useState<{ id: number; field: string } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [rieOpen, setRieOpen] = useState<number | undefined>(undefined);
  const [extra, setExtra] = useState<{ id: string; name: string; type: string; choices?: any[] }[]>([]);
  const [groupId, setGroupId] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  // Restore the saved column layout, dropping anything unrecognised and
  // appending any column added since the layout was saved.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const kept = saved.filter((id: any) => DEFAULT_ORDER.indexOf(id) >= 0);
      const missing = DEFAULT_ORDER.filter((id) => kept.indexOf(id) < 0);
      if (kept.length) setOrder([...kept, ...missing]);
    } catch {}
  }, []);
  function persist(next: string[]) {
    setOrder(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
  }
  function resetColumns() {
    persist(DEFAULT_ORDER);
    setMsg({ kind: "ok", text: "Columns put back in their original order." });
  }
  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    persist(next);
  }

  const current = useMemo(() => ({ who, status, priority, caseQ, q, showClosed, sort, dir }),
    [who, status, priority, caseQ, q, showClosed, sort, dir]);
  const isBlank = useMemo(() => JSON.stringify(current) === JSON.stringify(BLANK), [current]);

  useEffect(() => {
    if (!picker) return;
    const away = (e: MouseEvent) => { if (pickerBox.current && !pickerBox.current.contains(e.target as Node)) setPicker(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [picker]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (who) p.set("who", who);
    status.forEach((v) => p.append("status", v));
    priority.forEach((v) => p.append("priority", v));
    if (caseQ) p.set("case", caseQ);
    if (q) p.set("q", q);
    if (showClosed) p.set("closed", "1");
    p.set("sort", sort);
    p.set("dir", dir);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [who, status, priority, caseQ, q, showClosed, sort, dir, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/tasks?" + qs);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
      setTotal(j.total || 0);
      setMsg(null);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setLoading(false);
  }, [qs]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/tasks/meta").then((r) => r.json()).then((j) => { if (!j.error) setMeta(j); }).catch(() => {});
    // Every other field on the Airtable Tasks table, offered as a column.
    fetch("/api/mirror/tasks/schema").then((r) => r.json()).then((j) => {
      if (j.error) return;
      const mapped = new Set(Object.values(CF));
      const skip = /^(client name|efl status case name|status|order|priority|closed|task|user|modified|duration|due date|folder ?\/ ?file link#2)$/i;
      setExtra((j.fields || []).filter((f: any) => !mapped.has(f.id) && !skip.test(String(f.name).trim())));
    }).catch(() => {});
  }, []);

  const countRie = useCallback(() => {
    fetch("/api/tasks?who=RIE&pageSize=1")
      .then((r) => r.json()).then((j) => { if (!j.error) setRieOpen(j.total || 0); }).catch(() => {});
  }, []);
  useEffect(() => { countRie(); }, [countRie]);

  const loadViews = useCallback(() => {
    fetch("/api/views?page=tasks").then((r) => r.json()).then((j) => { if (!j.error) setViews(j.rows || []); }).catch(() => {});
  }, []);
  useEffect(() => { loadViews(); }, [loadViews]);

  function sortBy(col: string) {
    if (dragged.current) return;
    if (col.startsWith("at:")) { setMsg({ kind: "warn", text: "That column comes straight from Airtable, so it cannot be sorted here yet." }); return; }
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(DEFAULT_DIR[col] || "asc"); }
    setPage(1);
  }

  function applyParams(params: any) {
    const p = { ...BLANK, ...(params || {}) };
    setWho(p.who || "");
    setStatus(asList(p.status));
    setPriority(asList(p.priority));
    setCaseQ(p.caseQ || "");
    setQ(p.q || "");
    setShowClosed(!!p.showClosed);
    setSort(p.sort || "order");
    setDir(p.dir || "asc");
    setPage(1);
  }
  function clearAll() { applyParams(BLANK); }
  function matchesParams(params: any) {
    return JSON.stringify({ ...BLANK, ...(params || {}) }) === JSON.stringify(current);
  }

  async function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const dupe = views.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (dupe && !confirm('A view called "' + dupe.name + '" already exists. Replace it with the filters showing now?')) return;
    const r = await fetch("/api/views", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "tasks", name, params: current }),
    });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setNaming(false); setViewName("");
    setMsg({ kind: "ok", text: 'Saved the view "' + name + '".' });
    loadViews();
  }

  async function deleteView(v: View) {
    if (!confirm('Delete the saved view "' + v.name + '"? The tasks themselves are not touched.')) return;
    const r = await fetch("/api/views/" + v.id, { method: "DELETE" });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    loadViews();
  }

  async function patch(id: number, body: any) {
    const r = await fetch("/api/tasks/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return false; }
    return true;
  }
  // Inline: change one field and it saves at once.
  async function saveCell(t: any, field: string, value: any) {
    setCellEdit(null);
    if (String(t[field] ?? "") === String(value ?? "")) return;
    const r = await fetch("/api/tasks/" + t.id, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: value }),
    });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    if (j.fired?.length) setMsg({ kind: "ok", text: "Rule ran: " + j.fired.join("; ") + "." });
    load(); countRie();
  }

  async function saveEdit(id: number) {
    if (!(await patch(id, draft))) return;
    setEditing(null); load(); countRie();
  }
  async function toggleClosed(t: any, e?: React.MouseEvent | React.ChangeEvent) {
    const closing = !t.closed;
    if (!(await patch(t.id, { closed: closing }))) return;
    if (!closing) { load(); return; }
    // Mark it done with a flourish before the list refreshes.
    const big = ["p0", "p1"].indexOf(prioClass(t.priority)) >= 0;
    // Prefer where it was clicked; fall back to the row, then the middle of the
    // screen, so there is always a reaction wherever it was ticked from.
    let el = (e?.target as HTMLElement)?.getBoundingClientRect?.();
    if (!el || (!el.width && !el.height)) {
      const row = document.querySelector(`tr[data-task="${t.id}"]`);
      el = row?.getBoundingClientRect();
    }
    const x = el ? el.left + Math.min(el.width, 60) / 2 : window.innerWidth / 2;
    const y = el ? el.top + el.height / 2 : window.innerHeight / 2;
    celebrate(x, y, seasonFor().cast, big);
    setLeaving(t.id);
    setTimeout(() => { setLeaving(null); load(); countRie(); }, 520);
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/sync/tasks", { method: "POST" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Pulled ${j.pulled} from Airtable, sent ${j.pushed_new} new and ${j.pushed_upd} updates.` });
      load(); countRie();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setSyncing(false);
  }

  const GROUPS: GroupDef[] = [
    { id: "case", label: "Case", keyOf: (t) => t.case_name || t.client_name || "" },
    { id: "status", label: "Status", keyOf: (t) => t.status || "" },
    { id: "priority", label: "Priority", keyOf: (t) => t.priority || "" },
    { id: "who", label: "Who", keyOf: (t) => t.who || "" },
    { id: "due", label: "Due month", keyOf: (t) => d10(t.due_date).slice(0, 7) },
    { id: "state", label: "Open or closed", keyOf: (t) => (t.closed ? "Closed" : "Open") },
  ];
  const groupDef = GROUPS.find((g) => g.id === groupId) || null;
  const groups = buildGroups(rows, groupDef);

  const today = todayStr();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allCols = useMemo(() => [
    ...COLUMNS,
    ...extra.map((f) => ({ id: "at:" + f.id, label: f.name, width: 150, at: f })),
  ] as any[], [extra]);
  const cols = order.map((id) => allCols.find((c) => c.id === id)!).filter(Boolean);

  function atValue(f: any, v: any) {
    if (v === null || v === undefined || v === "") return <span className="muted">-</span>;
    if (f.type === "checkbox") return v ? "Yes" : <span className="muted">No</span>;
    if (f.type === "singleSelect" || f.type === "multipleSelects") {
      const colors = Object.fromEntries((f.choices || []).map((c: any) => [c.name, c.color]));
      return <Chip v={Array.isArray(v) ? v.join(", ") : v} colors={colors} />;
    }
    if (f.type === "date") return String(v).slice(0, 10);
    if (f.type === "dateTime" || f.type === "lastModifiedTime" || f.type === "createdTime") return when(v);
    if (f.type === "url") return <a href={String(v)} target="_blank" rel="noreferrer" className="filelink" title={String(v)}>{labelFor(String(v))}</a>;
    if (f.type === "multipleAttachments") return <span className="muted small">{(v as any[]).length} file(s)</span>;
    if (f.type === "multipleRecordLinks") return <span className="muted small">{(v as any[]).length} linked</span>;
    if (Array.isArray(v)) return <span className="small">{v.map((x: any) => (x && typeof x === "object" ? x.name : x)).join(", ")}</span>;
    if (v && typeof v === "object") return <span className="small">{String(v.name ?? "")}</span>;
    const txt = String(v).replace(/<[^>]*>/g, "");
    return <div className="cellclip" title={txt.length > 90 ? txt : undefined}><Linkify text={txt} /></div>;
  }

  function cell(id: string, t: any) {
    if (id.startsWith("at:")) {
      const f = extra.find((x) => "at:" + x.id === id);
      return <td key={id} className="small">{f ? atValue(f, t.data?.[f.id]) : null}</td>;
    }
    switch (id) {
      case "closed":
        return <td key={id} className="tick">
          <input type="checkbox" checked={!!t.closed} title={t.closed ? "Reopen this task" : "Mark this task done"} onChange={(e) => toggleClosed(t, e)} />
        </td>;
      case "priority":
        return <td key={id} className="small edit" onClick={() => setCellEdit({ id: t.id, field: "priority" })}>
          {cellEdit?.id === t.id && cellEdit.field === "priority" ? (
            <select autoFocus defaultValue={t.priority || ""} onBlur={() => setCellEdit(null)}
              onChange={(e) => saveCell(t, "priority", e.target.value)}>
              <option value="">-</option>
              {priorities.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : <Chip v={t.priority} colors={choices[CF.taskPriority]} />}
        </td>;
      case "case":
        return <td key={id}>{t.case_name || t.client_name || <span className="muted">-</span>}</td>;
      case "task":
        return <td key={id} className="edit" onDoubleClick={() => setCellEdit({ id: t.id, field: "task" })}>
          {cellEdit?.id === t.id && cellEdit.field === "task" ? (
            <textarea autoFocus defaultValue={t.task || ""} style={{ minHeight: 80 }}
              onBlur={(e) => saveCell(t, "task", e.target.value)} />
          ) : <div className="cellclip"><Linkify text={t.task} /></div>}
        </td>;
      case "link":
        return <td key={id} className="small">{t.link
          ? <a href={t.link} target="_blank" rel="noreferrer" className="filelink" title={t.link}>{labelFor(t.link)}</a>
          : <span className="muted">-</span>}</td>;
      case "status":
        return <td key={id} className="small edit" onClick={() => setCellEdit({ id: t.id, field: "status" })}>
          {cellEdit?.id === t.id && cellEdit.field === "status" ? (
            <select autoFocus defaultValue={t.status || ""} onBlur={() => setCellEdit(null)}
              onChange={(e) => saveCell(t, "status", e.target.value)}>
              <option value="">-</option>
              {statuses.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : <Chip v={t.status} colors={choices[CF.taskStatus]} />}
        </td>;
      case "who":
        return <td key={id} className="who edit" onClick={() => setCellEdit({ id: t.id, field: "who" })}>
          {cellEdit?.id === t.id && cellEdit.field === "who" ? (
            <select autoFocus defaultValue={t.who || ""} onBlur={() => setCellEdit(null)}
              onChange={(e) => saveCell(t, "who", e.target.value)}>
              <option value="">-</option>
              {whos.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : <Chip v={t.who} colors={choices[CF.taskWho]} dash={false} />}
        </td>;
      case "due":
        return <td key={id} className="date edit" onClick={() => setCellEdit({ id: t.id, field: "due_date" })}>
          {cellEdit?.id === t.id && cellEdit.field === "due_date" ? (
            <input type="date" autoFocus defaultValue={d10(t.due_date)} onBlur={() => setCellEdit(null)}
              onChange={(e) => saveCell(t, "due_date", e.target.value)} />
          ) : (d10(t.due_date) || <span className="muted">-</span>)}
        </td>;
      case "modified":
        return <td key={id} className="date nowrap" title={stamp(t.at_modified || t.updated_at)}>{when(t.at_modified || t.updated_at)}</td>;
      default:
        return <td key={id} />;
    }
  }

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="task">
        <h2>Saved views</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            <button className={"chip " + (isBlank ? "on" : "")} onClick={clearAll}>All open</button>
            {QUICK.map((v) => (
              <button key={v.name} className={"chip " + (matchesParams(v.params) ? "on" : "")} onClick={() => applyParams(v.params)}>{v.name}</button>
            ))}
            <span className="sep" />
            {views.map((v) => (
              <span key={v.id} className="viewchip">
                <button className={"chip " + (matchesParams(v.params) ? "on" : "")} title={v.owner ? "Saved by " + v.owner : ""} onClick={() => applyParams(v.params)}>{v.name}</button>
                <button className="x" title={"Delete the view " + v.name} onClick={() => deleteView(v)}>&times;</button>
              </span>
            ))}
            {views.length === 0 ? <span className="muted small">Set filters below, then Save these filters to add your own button here.</span> : null}
          </div>
          <div className="spacer" />
          {naming ? (
            <div className="row">
              <input type="text" autoFocus value={viewName} maxLength={40} placeholder="e.g. RIE open"
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") { setNaming(false); setViewName(""); } }}
                style={{ width: 170 }} />
              <button className="btn primary sm" onClick={saveView}>Save</button>
              <button className="btn ghost sm" onClick={() => { setNaming(false); setViewName(""); }}>Cancel</button>
            </div>
          ) : (
            <button className="btn sm" onClick={() => setNaming(true)}>Save these filters</button>
          )}
        </div>
      </div>

      <div className="card noprint" data-tone="task">
        <h2>Filters</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            <button className={"chip " + (who === "" ? "on" : "")} onClick={() => { setWho(""); setPage(1); }}>Everyone</button>
            {whos.map((u) => (
              <button key={u} className={"chip " + (who === u ? "on" : "")} onClick={() => { setWho(u); setPage(1); }}>{u}</button>
            ))}
          </div>
          <div className="spacer" />
          <button className={"chip " + (showClosed ? "on" : "")} onClick={() => { setShowClosed(!showClosed); setPage(1); }}>{showClosed ? "Showing closed" : "Open only"}</button>
        </div>
        <div className="grid g4" style={{ marginTop: 9 }}>
          <MultiSelect label="Status" allLabel="All statuses" options={statuses}
            value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <MultiSelect label="Priority" allLabel="All priorities" options={priorities}
            value={priority} onChange={(v) => { setPriority(v); setPage(1); }} />
          <div><label className="f">Case contains</label><input type="search" value={caseQ} onChange={(e) => { setCaseQ(e.target.value); setPage(1); }} placeholder="e.g. Nichols" /></div>
          <div><label className="f">Task text contains</label><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="e.g. discovery" /></div>
        </div>
      </div>

      {showRules ? (
        <Rules statuses={statuses} priorities={priorities} users={whos} onChanged={load} />
      ) : null}

      <div className="card" data-tone="task">
        <h2>Tasks</h2>
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats"><div className="stat"><b>{total.toLocaleString()}</b><span>{showClosed ? "Tasks" : "Open tasks"}</span></div></div>
          <div className="spacer" />
          <div className="row noprint">
            <RowSize />
            <GroupPicker defs={GROUPS} value={groupId} onChange={(v) => { setGroupId(v); setFolded({}); }} />
            <span className="muted small">Click a heading to sort. Drag a heading to move the column.</span>
            <div className="ms" ref={pickerBox}>
              <button className="btn sm" onClick={() => setPicker(!picker)}>Columns ({cols.length}/{allCols.length})</button>
              {picker ? (
                <div className="mspanel" style={{ right: 0, left: "auto" }}>
                  <div className="msrow">
                    <button className="btn ghost sm" onClick={() => persist(allCols.map((c: any) => c.id))}>Show all</button>
                    <button className="btn ghost sm" onClick={() => { resetColumns(); cw.reset(); }}>Reset</button>
                    <div className="spacer" />
                    <button className="btn ghost sm" onClick={() => setPicker(false)}>Done</button>
                  </div>
                  <div className="mslist">
                    {allCols.map((c: any) => (
                      <label key={c.id} className="msitem">
                        <input type="checkbox" checked={order.indexOf(c.id) >= 0}
                          onChange={() => persist(order.indexOf(c.id) >= 0 ? order.filter((x) => x !== c.id) : [...order, c.id])} />
                        <span>{c.label}</span>
                        <span className="muted small" style={{ marginLeft: "auto" }}>
                          {order.indexOf(c.id) < 0 ? "hidden" : c.at ? "Airtable" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button className={"btn sm" + (showRules ? " primary" : "")} onClick={() => setShowRules(!showRules)}>Automations</button>
            <ParadeControls />
            <button className="btn sm" onClick={() => { resetColumns(); cw.reset(); }}>Reset columns</button>
            <button className="btn sm" onClick={() => window.print()}>Print / PDF</button>
            <SyncButton busy={syncing} onClick={syncNow} syncKey="tasks" />
          </div>
        </div>

        <BulkBar count={pick.count} fields={BULK_FIELDS} busy={bulking} noun="tasks"
          onApply={bulkApply} onClear={pick.clear} onDelete={bulkDelete} />

        <div className="tablewrap">
          <table className={"data" + (cw.sized ? " sized" : "")}>
            <thead><tr>
              <SelectAllTh ids={rows.map((r: any) => r.id)} sel={pick.sel} setAll={pick.setAll} />
              {cols.map((c) => (
                <th key={c.id} style={cw.widthOf(c.id, c.width)}
                    className={"sortable" + (overId === c.id ? " over" : "") + (dragId === c.id ? " dragging" : "")}
                    draggable
                    onDragStart={() => { dragged.current = true; setDragId(c.id); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); setTimeout(() => { dragged.current = false; }, 60); }}
                    onDragOver={(e) => { e.preventDefault(); setOverId(c.id); }}
                    onDragLeave={() => setOverId((v) => (v === c.id ? null : v))}
                    onDrop={(e) => { e.preventDefault(); drop(c.id); setOverId(null); }}
                    title={"Click to sort by " + c.label + ". Drag to move this column."}
                    onClick={() => sortBy(c.id)}>
                  <span className="grip">⠿</span>{c.label}
                  <span className="caret">{sort === c.id ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                  <Resizer onDown={(e) => cw.start(e, c.id)} />
                </th>
              ))}
              <th className="noprint" style={{ width: 62 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={cols.length + 2} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={cols.length + 2} className="muted">No tasks match these filters.</td></tr>)
: groups.map((g) => (
                <Fragment key={"g" + g.key}>
                  {groupDef ? (
                    <GroupRow label={g.key} count={g.items.length} span={cols.length + 2}
                      collapsed={!!folded[g.key]} onToggle={() => setFolded({ ...folded, [g.key]: !folded[g.key] })} />
                  ) : null}
                  {folded[g.key] ? null : g.items.map((t) => editing === t.id ? (
                <tr key={t.id}><td colSpan={cols.length + 2}>
                  <div className="grid g4">
                    <div><label className="f">Status</label>
                      <select value={draft.status || ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        <option value="">-</option>
                        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Priority</label>
                      <select value={draft.priority || ""} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                        <option value="">-</option>
                        {priorities.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Who</label>
                      <select value={draft.who || ""} onChange={(e) => setDraft({ ...draft, who: e.target.value })}>
                        <option value="">-</option>
                        {whos.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Due</label><input type="date" value={draft.due_date || ""} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></div>
                  </div>
                  <div style={{ marginTop: 7 }}><label className="f">Task</label><textarea value={draft.task || ""} onChange={(e) => setDraft({ ...draft, task: e.target.value })} /></div>
                  <div className="row" style={{ marginTop: 9 }}>
                    <button className="btn primary sm" onClick={() => saveEdit(t.id)}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                    <div className="spacer" />
                    <span className="muted small">Changes reach Airtable at the next sync.</span>
                  </div>
                </td></tr>
              ) : (
                <tr key={t.id} className={prioClass(t.priority)
                  + (!t.closed && t.due_date && d10(t.due_date) < today ? " overdue" : "")
                  + (leaving === t.id ? " leaving" : "")
                  + (pick.has(t.id) ? " picked" : "")} data-task={t.id}>
                  <SelectTd id={t.id} has={pick.has} toggle={pick.toggle} />
                  {cols.map((c) => cell(c.id, t))}
                  <td className="noprint">
                    <button className="btn ghost sm" onClick={() => { setEditing(t.id); setDraft({ status: t.status, priority: t.priority, who: t.who, due_date: d10(t.due_date), task: t.task }); }}>Edit</button>
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

      <Parade count={rieOpen} label="RIE open tasks" />
    </div>
  );
}
