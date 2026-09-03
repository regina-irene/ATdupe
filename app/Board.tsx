"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FIRMS, KINDS, QUICK_HOURS, CF } from "../lib/constants";
import Chip, { useChoices, useOptions } from "./Chip";
import { Resizer, useColWidths } from "./colwidths";
import RowSize from "./RowSize";
import Linkify, { labelFor } from "./Linkify";
import { Fragment, GroupDef, GroupPicker, GroupRow, buildGroups } from "./group";
import SyncButton from "./SyncButton";
import BulkBar, { BulkField, SelectAllTh, SelectTd, useSelection } from "./BulkBar";

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function startOfWeek(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
const startOfMonth = (iso: string) => iso.slice(0, 8) + "01";
const d10 = (v: any) => (v ? String(v).slice(0, 10) : "");

const COLUMNS: { id: string; label: string; width?: number }[] = [
  { id: "date", label: "Date", width: 92 },
  { id: "case", label: "Case", width: 190 },
  { id: "entry", label: "Entry" },
  { id: "hrs", label: "Hrs", width: 58 },
  { id: "who", label: "Who", width: 112 },
  { id: "type", label: "Type", width: 128 },
  { id: "firm", label: "Firm", width: 100 },
  { id: "billed", label: "Billed", width: 74 },
  { id: "url", label: "Link", width: 110 },
  { id: "content", label: "Content", width: 200 },
  { id: "email", label: "Email", width: 170 },
  { id: "source", label: "Source", width: 90 },
  { id: "added", label: "Added", width: 130 },
  { id: "changed", label: "Changed", width: 130 },
];
const DEFAULT_COLS = ["date", "case", "entry", "hrs", "who", "type"];
const SORTABLE = new Set(["date", "case", "entry", "hrs", "who", "type", "firm", "billed", "url", "content", "email", "added", "changed"]);
const COLS_KEY = "efl.time.columns";

function CaseCombo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/cases?q=" + encodeURIComponent(value || ""));
        const j = await r.json();
        if (live) setOpts(j.cases || []);
      } catch {}
    }, 180);
  return () => { live = false; clearTimeout(t); };
  }, [value]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="combo" ref={box}>
      <input type="text" value={value} placeholder="Start typing a case name..." onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && opts.length > 0 ? (
        <div className="list">{opts.map((o) => (<div key={o} onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}>{o}</div>))}</div>
      ) : null}
    </div>
  );
}

export default function Board({ me, aiOn }: { me: { name: string; email: string }; aiOn: boolean }) {
  const t = today();
  const [date, setDate] = useState(t);
  const [caseName, setCaseName] = useState("");
  const [entry, setEntry] = useState("");
  const [duration, setDuration] = useState("");
  const [kind, setKind] = useState("");
  const [firm, setFirm] = useState("EFL");
  const [url, setUrl] = useState("");
  const [more, setMore] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const choices = useChoices();
  // Option lists come from Airtable itself, so a choice added there shows
  // up here without a code change. The constants are only a fallback for
  // when the token cannot read the base schema.
  const kinds = useOptions(CF.timeKind, KINDS);
  const firms = useOptions(CF.timeFirm, FIRMS);
  const pick = useSelection<number>();
  const [bulking, setBulking] = useState(false);
  // Only Type, Firm, Who, Case, Hours, Date and Billed make sense to set on a
  // batch. The entry text itself is per-row, so it is left out on purpose.
  const BULK_FIELDS: BulkField[] = [
    { id: "kind", label: "Type", options: kinds, clearable: true },
    { id: "firm", label: "Firm", options: firms, clearable: true },
    { id: "user_name", label: "Who", kind: "text" },
    { id: "case_name", label: "Case", kind: "text" },
    { id: "duration", label: "Hours", kind: "number" },
    { id: "entry_date", label: "Date", kind: "date" },
    { id: "billed", label: "Billed", kind: "checkbox" },
  ];

  async function bulkApply(fieldId: string, value: any) {
    setBulking(true); setMsg(null);
    try {
      const r = await fetch("/api/entries/bulk", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: pick.sel, patch: { [fieldId]: value } }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const label = BULK_FIELDS.find((f) => f.id === fieldId)?.label || fieldId;
      setMsg({ kind: "ok", text: `${label} set on ${j.updated} ${j.updated === 1 ? "entry" : "entries"}. They go to Airtable at the next sync.` });
      pick.clear();
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBulking(false);
  }

  async function bulkDelete() {
    const n = pick.sel.length;
    if (!confirm(`Delete ${n} time ${n === 1 ? "entry" : "entries"}? They are removed from Airtable as well, and this cannot be undone.`)) return;
    setBulking(true); setMsg(null);
    try {
      const r = await fetch("/api/entries/bulk", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: pick.sel }),
      });
      const j = await r.json();
      if (j.error && !j.deleted) throw new Error(j.error);
      setMsg(j.error
        ? { kind: "err", text: j.error }
        : { kind: "ok", text: `Deleted ${j.deleted} here and in Airtable.` });
      pick.clear();
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBulking(false);
  }
  const cw = useColWidths("efl.time.widths");
  const loadViews = useCallback(() => {
    fetch("/api/views?page=time").then((r) => r.json())
      .then((j) => { if (!j.error) setViews(j.rows || []); }).catch(() => {});
  }, []);
  useEffect(() => { loadViews(); }, [loadViews]);
  const [order, setOrder] = useState<string[]>(DEFAULT_COLS);
  const [picker, setPicker] = useState(false);
  const pickerBox = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragged = useRef(false);
  const [views, setViews] = useState<any[]>([]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [polishing, setPolishing] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);

  // Arriving from a task via "Log time" prefills the case.
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("case");
      if (c) setCaseName(c);
    } catch {}
  }, []);

  const [from, setFrom] = useState(startOfMonth(t));
  const [to, setTo] = useState(t);
  const [fUser, setFUser] = useState("");
  const [fCase, setFCase] = useState("");
  const [fKind, setFKind] = useState("");
  const [fFirm, setFFirm] = useState("");
  const [search, setSearch] = useState("");
  const [within, setWithin] = useState("");
  const [billed, setBilled] = useState("");
  const [minHrs, setMinHrs] = useState("");
  const [maxHrs, setMaxHrs] = useState("");
  const [notQ, setNotQ] = useState("");
  const [noHrs, setNoHrs] = useState(false);
  const [caseEmpty, setCaseEmpty] = useState(false);
  const [hasUrl, setHasUrl] = useState("");
  const [preset, setPreset] = useState("month");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState("date");
  const [dir, setDir] = useState("desc");
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hours, setHours] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [users, setUsers] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  const filterQS = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (fUser) p.set("user", fUser);
    if (fCase) p.set("case", fCase);
    if (fKind) p.set("kind", fKind);
    if (fFirm) p.set("firm", fFirm);
    if (search) p.set("q", search);
    if (notQ) p.set("notQ", notQ);
    if (within) { if (/^\d+$/.test(within)) p.set("lastDays", within); else p.set("within", within); }
    if (billed) p.set("billed", billed);
    if (minHrs) p.set("minHrs", minHrs);
    if (maxHrs) p.set("maxHrs", maxHrs);
    if (noHrs) p.set("noHrs", "1");
    if (caseEmpty) p.set("caseEmpty", "1");
    if (hasUrl) p.set("hasUrl", hasUrl);
    p.set("sort", sort); p.set("dir", dir);
    return p.toString();
  }, [from, to, fUser, fCase, fKind, fFirm, search, sort, dir, within, billed, minHrs, maxHrs, notQ, noHrs, caseEmpty, hasUrl]);

  const query = useMemo(() => filterQS + "&page=" + page + "&pageSize=" + pageSize, [filterQS, page, pageSize]);
  const extraCount = [fUser, fCase, fKind, fFirm, search, within, billed, minHrs, maxHrs, notQ, hasUrl].filter(Boolean).length + (noHrs ? 1 : 0) + (caseEmpty ? 1 : 0);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/entries?" + query);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []); setTotal(j.total || 0); setHours(j.hours || 0);
      if (j.users) setUsers(j.users);
      setMsg(null);
    } catch (e: any) { setMsg({ kind: "err", text: e.message || "Could not load entries" }); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [query]);

  function applyPreset(p: string) {
    setPreset(p); setPage(1);
    if (p === "today") { setFrom(t); setTo(t); }
    else if (p === "yesterday") { setFrom(addDays(t, -1)); setTo(addDays(t, -1)); }
    else if (p === "week") { setFrom(startOfWeek(t)); setTo(t); }
    else if (p === "month") { setFrom(startOfMonth(t)); setTo(t); }
    else if (p === "90") { setFrom(addDays(t, -90)); setTo(t); }
    else if (p === "all") { setFrom(""); setTo(""); }
  }

  function toggleSort(key: string) {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(key); setDir(key === "date" || key === "hrs" ? "desc" : "asc"); }
    setPage(1);
  }

  function Th({ id, label, w }: { id: string; label: string; w?: number }) {
    const canSort = SORTABLE.has(id);
    return (
      <th className={canSort ? "sortable" : ""} style={cw.widthOf(id, w)} draggable
        onDragStart={() => { dragged.current = true; setDragId(id); }}
        onDragEnd={() => { setDragId(null); setTimeout(() => { dragged.current = false; }, 60); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); dropCol(id); }}
        onClick={() => { if (!dragged.current && canSort) toggleSort(id); }}>
        <span className="grip">⠿</span>{label}
        {sort === id ? <span className="ar">{dir === "asc" ? "▲" : "▼"}</span> : null}
        <Resizer onDown={(e) => cw.start(e, id)} />
      </th>
    );
  }

  // One cell renderer per column, so the picker can show any of them.
  function cell(id: string, r: any) {
    switch (id) {
      case "date": return <td key={id} className="date">{d10(r.entry_date)}</td>;
      case "case": return <td key={id}>{r.case_name || <span className="muted">-</span>}</td>;
      case "entry": return <td key={id}><div className="cellclip"><Linkify text={r.time_entry} /></div>{r.url ? <> <a href={r.url} target="_blank" rel="noreferrer" className="small noprint">link</a></> : null}</td>;
      case "hrs": return <td key={id} className="num">{r.duration === null ? "" : Number(r.duration).toFixed(2)}</td>;
      case "who": return <td key={id} className="who">{r.user_name}</td>;
      case "type": return <td key={id}><Chip v={r.kind} colors={choices[CF.timeKind]} dash={false} /></td>;
      case "firm": return <td key={id} className="small"><Chip v={r.firm} colors={choices[CF.timeFirm]} /></td>;
      case "billed": return <td key={id} className="small">{r.billed ? "Yes" : <span className="muted">No</span>}</td>;
      case "url": return <td key={id} className="small">{r.url
        ? <a href={r.url} target="_blank" rel="noreferrer" className="filelink" title={r.url}>{labelFor(r.url)}</a>
        : <span className="muted">-</span>}</td>;
      case "content": return <td key={id} className="small"><div className="cellclip"><Linkify text={r.content} /></div></td>;
      case "email": return <td key={id} className="small muted">{r.user_email}</td>;
      case "source": return <td key={id} className="small muted">{r.source}</td>;
      case "added": return <td key={id} className="date small muted">{r.added}</td>;
      case "changed": return <td key={id} className="date small muted">{r.changed}</td>;
      default: return <td key={id} />;
    }
  }

  async function polish() {
    if (!entry.trim()) { setMsg({ kind: "err", text: "Write something first, even shorthand." }); return; }
    setPolishing(true); setMsg(null); setDraftText(null);
    try {
      const r = await fetch("/api/expand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: entry, case_name: caseName, kind }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setDraftText(j.text);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setPolishing(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!entry.trim()) { setMsg({ kind: "err", text: "Describe the work before saving." }); return; }
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entry_date: date, case_name: caseName, time_entry: entry, duration: duration === "" ? null : Number(duration), kind, firm, url, content }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setEntry(""); setDuration(""); setUrl(""); setContent(""); setDraftText(null);
      setMsg({ kind: "ok", text: "Saved. It will reach Airtable at the next sync." });
      setTimeout(() => setMsg(null), 2600);
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message || "Save failed" }); }
    setSaving(false);
  }

  async function saveEdit(id: number) {
    const r = await fetch("/api/entries/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setEditing(null); load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this time entry? It is removed from Airtable as well, and cannot be undone.")) return;
    const r = await fetch("/api/entries/" + id, { method: "DELETE" });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setEditing(null);
    setMsg({ kind: "ok", text: j.airtable ? "Deleted here and in Airtable." : "Deleted." });
    load();
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/sync/time", { method: "POST" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Sync done. Pulled ${j.pulled}, sent ${j.pushed_new} new and ${j.pushed_upd} updates.` });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setSyncing(false);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const GROUPS: GroupDef[] = [
    { id: "case", label: "Case", keyOf: (r) => r.case_name || "" },
    { id: "who", label: "Who", keyOf: (r) => r.user_name || "" },
    { id: "kind", label: "Type", keyOf: (r) => r.kind || "" },
    { id: "firm", label: "Firm", keyOf: (r) => r.firm || "" },
    { id: "date", label: "Date", keyOf: (r) => d10(r.entry_date) },
    { id: "month", label: "Month", keyOf: (r) => d10(r.entry_date).slice(0, 7) },
  ];
  const groupDef = GROUPS.find((g) => g.id === groupId) || null;
  const groups = buildGroups(rows, groupDef);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) setOrder(saved.filter((c: any) => COLUMNS.some((x) => x.id === c)));
      }
    } catch {}
  }, []);
  function persist(next: string[]) {
    setOrder(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch {}
  }
  useEffect(() => {
    if (!picker) return;
    const away = (e: MouseEvent) => { if (pickerBox.current && !pickerBox.current.contains(e.target as Node)) setPicker(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [picker]);
  function dropCol(target: string) {
    if (!dragId || dragId === target) return;
    const next = order.filter((c) => c !== dragId);
    next.splice(next.indexOf(target), 0, dragId);
    persist(next);
  }

  const cols = order.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean);

  const current = { from, to, fUser, fCase, fKind, fFirm, search, sort, dir, within, billed, minHrs, maxHrs, notQ, noHrs, caseEmpty, hasUrl };
  const isBlank = !from && !to && !fUser && !fCase && !fKind && !fFirm && !search && !within && !billed && !minHrs && !maxHrs && !notQ && !noHrs && !caseEmpty && !hasUrl;
  const sameAs = (p: any) => JSON.stringify({
    from: p?.from ?? "", to: p?.to ?? "", fUser: p?.fUser ?? "", fCase: p?.fCase ?? "",
    fKind: p?.fKind ?? "", fFirm: p?.fFirm ?? "", search: p?.search ?? "",
    sort: p?.sort ?? "date", dir: p?.dir ?? "desc",
    within: p?.within ?? "", billed: p?.billed ?? "", minHrs: p?.minHrs ?? "", maxHrs: p?.maxHrs ?? "",
    notQ: p?.notQ ?? "", noHrs: p?.noHrs ?? false, caseEmpty: p?.caseEmpty ?? false, hasUrl: p?.hasUrl ?? "",
  }) === JSON.stringify(current);

  function applyView(p: any) {
    setFrom(p?.from ?? ""); setTo(p?.to ?? "");
    setFUser(p?.fUser ?? ""); setFCase(p?.fCase ?? "");
    setFKind(p?.fKind ?? ""); setFFirm(p?.fFirm ?? "");
    setSearch(p?.search ?? "");
    setSort(p?.sort ?? "date"); setDir(p?.dir ?? "desc");
    setWithin(p?.within ?? ""); setBilled(p?.billed ?? "");
    setMinHrs(p?.minHrs ?? ""); setMaxHrs(p?.maxHrs ?? ""); setNotQ(p?.notQ ?? "");
    setNoHrs(!!p?.noHrs); setCaseEmpty(!!p?.caseEmpty); setHasUrl(p?.hasUrl ?? "");
    setPage(1);
  }
  async function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const j = await (await fetch("/api/views", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "time", name, params: current }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setNaming(false); setViewName("");
    setMsg({ kind: "ok", text: 'Saved the view "' + name + '".' });
    loadViews();
  }
  async function deleteView(v: any) {
    if (!confirm('Delete the saved view "' + v.name + '"?')) return;
    await fetch("/api/views/" + v.id, { method: "DELETE" });
    loadViews();
  }


  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <form className="card" data-tone="add" onSubmit={save}>
        <h2>Add time</h2>
        <div className="grid" style={{ gridTemplateColumns: "118px minmax(0,1fr) 88px 150px 118px" }}>
          <div><label className="f">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="f">Case</label><CaseCombo value={caseName} onChange={setCaseName} /></div>
          <div><label className="f">Hours</label><input type="number" step="0.01" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="0.25" /></div>
          <div><label className="f">Type</label><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">-</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div><label className="f">Firm</label><select value={firm} onChange={(e) => setFirm(e.target.value)}>{firms.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
        </div>
        <div className="chips nowrap">
          {QUICK_HOURS.map((h) => (<button type="button" key={h} className={"chip " + (String(h) === duration ? "on" : "")} onClick={() => setDuration(String(h))}>{h}</button>))}
        </div>
        <div style={{ marginTop: 7 }}>
          <label className="f">What you did</label>
          <textarea value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="tc w client re PP schedule; rev OC email" />
        </div>
        {draftText ? (
          <div className="draft">
            <label className="f">Suggested wording</label>
            <p>{draftText}</p>
            <div className="row">
              <button type="button" className="btn primary sm" onClick={() => { setEntry(draftText); setDraftText(null); }}>Use this</button>
              <button type="button" className="btn ghost sm" onClick={() => setDraftText(null)}>Keep mine</button>
              <button type="button" className="btn ghost sm" disabled={polishing} onClick={polish}>Try again</button>
            </div>
          </div>
        ) : null}
        {more ? (
          <div className="grid g2" style={{ marginTop: 7 }}>
            <div><label className="f">Link</label><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
            <div><label className="f">Notes / email content</label><textarea value={content} onChange={(e) => setContent(e.target.value)} /></div>
          </div>
        ) : null}
        <div className="row" style={{ marginTop: 9 }}>
          <button className="btn primary" disabled={saving} type="submit">{saving ? "Saving..." : "Save entry"}</button>
          {aiOn ? <button type="button" className="btn" disabled={polishing} onClick={polish}>{polishing ? "Working..." : "Make billing ready"}</button> : null}
          <button type="button" className="btn ghost sm" onClick={() => setMore(!more)}>{more ? "Fewer fields" : "Link and notes"}</button>
          <div className="spacer" />
          <span className="muted small">{me.name}</span>
        </div>
      </form>

      <div className="card noprint" data-tone="filter">
        <h2>Filters</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            {[["today","Today"],["yesterday","Yesterday"],["week","This week"],["month","This month"],["90","90 days"],["all","All time"]].map(([k, label]) => (
              <button key={k} className={"chip " + (preset === k ? "on" : "")} onClick={() => applyPreset(k as string)}>{label}</button>
            ))}
          </div>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setShowFilters(!showFilters)}>{showFilters ? "Hide filters" : "More filters"}{extraCount ? " (" + extraCount + ")" : ""}</button>
        </div>
        {showFilters ? (
          <>
            <div className="grid g5" style={{ marginTop: 9 }}>
              <div><label className="f">From</label><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(""); setPage(1); }} /></div>
              <div><label className="f">To</label><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(""); setPage(1); }} /></div>
              <div><label className="f">Who</label><select value={fUser} onChange={(e) => { setFUser(e.target.value); setPage(1); }}><option value="">Everyone</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
              <div><label className="f">Type</label><select value={fKind} onChange={(e) => { setFKind(e.target.value); setPage(1); }}><option value="">All types</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label className="f">Firm</label><select value={fFirm} onChange={(e) => { setFFirm(e.target.value); setPage(1); }}><option value="">All firms</option>{firms.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
            </div>
            <div className="grid g2" style={{ marginTop: 9 }}>
              <div><label className="f">Case contains</label><input type="search" value={fCase} onChange={(e) => { setFCase(e.target.value); setPage(1); }} placeholder="e.g. Nichols" /></div>
              <div><label className="f">Entry text contains</label><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="e.g. deposition" /></div>
            </div>

            <div className="grid g4" style={{ marginTop: 7 }}>
              <div><label className="f">Period</label>
                <select value={within} onChange={(e) => { setWithin(e.target.value); setPage(1); }}>
                  <option value="">Use the dates above</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </div>
              <div><label className="f">Billed</label>
                <select value={billed} onChange={(e) => { setBilled(e.target.value); setPage(1); }}>
                  <option value="">Either</option>
                  <option value="true">Billed</option>
                  <option value="false">Not billed</option>
                </select>
              </div>
              <div><label className="f">Hours at least</label>
                <input type="number" step="0.01" min="0" value={minHrs}
                  onChange={(e) => { setMinHrs(e.target.value); setPage(1); }} placeholder="0.00" /></div>
              <div><label className="f">Hours at most</label>
                <input type="number" step="0.01" min="0" value={maxHrs}
                  onChange={(e) => { setMaxHrs(e.target.value); setPage(1); }} placeholder="0.00" /></div>
            </div>

            <div className="row" style={{ marginTop: 7 }}>
              <div style={{ flex: 1 }}><label className="f">Entry text does not contain</label>
                <input type="search" value={notQ} onChange={(e) => { setNotQ(e.target.value); setPage(1); }}
                  placeholder="e.g. no charge" /></div>
              <div className="chips" style={{ marginTop: 0, alignSelf: "flex-end", paddingBottom: 2 }}>
                <button className={"chip " + (noHrs ? "on" : "")} onClick={() => { setNoHrs(!noHrs); setPage(1); }}>No hours</button>
                <button className={"chip " + (caseEmpty ? "on" : "")} onClick={() => { setCaseEmpty(!caseEmpty); setPage(1); }}>No case</button>
                <button className={"chip " + (hasUrl === "1" ? "on" : "")} onClick={() => { setHasUrl(hasUrl === "1" ? "" : "1"); setPage(1); }}>Has a link</button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="card" data-tone="list">
        <h2>Entries</h2>
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats">
            <div className="stat"><b>{total.toLocaleString()}</b><span>Entries</span></div>
            <div className="stat"><b>{Number(hours).toFixed(2)}</b><span>Hours</span></div>
          </div>
          <div className="spacer" />
          <div className="row noprint">
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ width: 96 }}>
              <option value={50}>50 / page</option><option value={200}>200 / page</option><option value={1000}>1000 / page</option>
            </select>
            <a className="btn sm" href={"/api/entries/export?" + filterQS}>Excel / CSV</a>
            <RowSize />
            <div className="ms" ref={pickerBox}>
              <button className="btn sm" onClick={() => setPicker(!picker)}>Columns ({cols.length}/{COLUMNS.length})</button>
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
                        <input type="checkbox" checked={order.indexOf(c.id) >= 0}
                          onChange={() => persist(order.indexOf(c.id) >= 0 ? order.filter((x) => x !== c.id) : [...order, c.id])} />
                        <span>{c.label}</span>
                        {order.indexOf(c.id) < 0 ? <span className="muted small" style={{ marginLeft: "auto" }}>hidden</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <GroupPicker defs={GROUPS} value={groupId} onChange={(v) => { setGroupId(v); setFolded({}); }} />
            {cw.sized ? <button className="btn sm" onClick={cw.reset}>Reset widths</button> : null}
            <button className="btn sm" onClick={() => window.print()}>Print / PDF</button>
            <SyncButton busy={syncing} onClick={syncNow} syncKey="time" />
          </div>
        </div>
        <div className="row noprint" style={{ marginBottom: 9 }}>
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            <button className={"chip " + (isBlank ? "on" : "")} onClick={() => applyView({})}>Everything</button>
            {views.map((v) => (
              <span key={v.id} className="viewchip">
                <button className={"chip " + (sameAs(v.params) ? "on" : "")} title={v.owner ? "Saved by " + v.owner : ""}
                  onClick={() => applyView(v.params)}>{v.name}</button>
                <button className="x" title={"Delete " + v.name} onClick={() => deleteView(v)}>&times;</button>
              </span>
            ))}
            {views.length === 0 ? <span className="muted small">Set the filters, then save them here as a button.</span> : null}
          </div>
          <div className="spacer" />
          {naming ? (
            <div className="row">
              <input type="text" autoFocus value={viewName} maxLength={40} placeholder="e.g. This month, RIE"
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

        <BulkBar count={pick.count} fields={BULK_FIELDS} busy={bulking} noun="entries"
          onApply={bulkApply} onClear={pick.clear} onDelete={bulkDelete} />

        <div className="tablewrap">
          <table className={"data" + (cw.sized ? " sized" : "")}>
            <thead><tr>
              <SelectAllTh ids={rows.map((r: any) => r.id)} sel={pick.sel} setAll={pick.setAll} />
              {cols.map((c) => <Th key={c.id} id={c.id} label={c.label} w={c.width} />)}
              <th className="noprint" style={{ width: 58 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={cols.length + 2} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={cols.length + 2} className="muted">No entries match these filters.</td></tr>)
: groups.map((g) => (
                <Fragment key={"g" + g.key}>
                  {groupDef ? (
                    <GroupRow label={g.key} count={g.items.length} span={cols.length + 2} extra={g.items.reduce((n: number, x: any) => n + Number(x.duration || 0), 0).toFixed(2) + " hrs"}
                      collapsed={!!folded[g.key]} onToggle={() => setFolded({ ...folded, [g.key]: !folded[g.key] })} />
                  ) : null}
                  {folded[g.key] ? null : g.items.map((r) => editing === r.id ? (
                <tr key={r.id}><td colSpan={cols.length + 2}>
                  <div className="grid g4">
                    <div><label className="f">Date</label><input type="date" value={draft.entry_date || ""} onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })} /></div>
                    <div style={{ gridColumn: "span 2" }}><label className="f">Case</label><CaseCombo value={draft.case_name || ""} onChange={(v) => setDraft({ ...draft, case_name: v })} /></div>
                    <div><label className="f">Hours</label><input type="number" step="0.01" value={draft.duration ?? ""} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} /></div>
                  </div>
                  <div style={{ marginTop: 7 }}><label className="f">Entry</label><textarea value={draft.time_entry || ""} onChange={(e) => setDraft({ ...draft, time_entry: e.target.value })} /></div>
                  <div className="grid g3" style={{ marginTop: 7 }}>
                    <div><label className="f">Type</label><select value={draft.kind || ""} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}><option value="">-</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
                    <div><label className="f">Firm</label><select value={draft.firm || ""} onChange={(e) => setDraft({ ...draft, firm: e.target.value })}><option value="">-</option>{firms.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
                    <div><label className="f">Who</label><input type="text" value={draft.user_name || ""} onChange={(e) => setDraft({ ...draft, user_name: e.target.value })} /></div>
                  </div>
                  <div className="row" style={{ marginTop: 9 }}>
                    <button className="btn primary sm" onClick={() => saveEdit(r.id)}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                    <div className="spacer" />
                    <button className="btn danger sm" onClick={() => remove(r.id)}>Delete</button>
                  </div>
                </td></tr>
              ) : (
                <tr key={r.id} className={pick.has(r.id) ? "picked" : ""}>
                  <SelectTd id={r.id} has={pick.has} toggle={pick.toggle} />
                  {cols.map((c) => cell(c.id, r))}
                  <td className="noprint"><button className="btn ghost sm" onClick={() => { setEditing(r.id); setDraft({ entry_date: d10(r.entry_date), case_name: r.case_name, time_entry: r.time_entry, duration: r.duration, kind: r.kind, firm: r.firm, user_name: r.user_name }); }}>Edit</button></td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row noprint" style={{ marginTop: 9 }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page.toLocaleString()} of {pages.toLocaleString()}</span>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
