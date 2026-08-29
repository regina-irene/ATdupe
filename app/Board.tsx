"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FIRMS, KINDS, QUICK_HOURS, CF } from "../lib/constants";
import Chip, { useChoices } from "./Chip";
import { Fragment, GroupDef, GroupPicker, GroupRow, buildGroups } from "./group";

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
    p.set("sort", sort); p.set("dir", dir);
    return p.toString();
  }, [from, to, fUser, fCase, fKind, fFirm, search, sort, dir]);

  const query = useMemo(() => filterQS + "&page=" + page + "&pageSize=" + pageSize, [filterQS, page, pageSize]);
  const extraCount = [fUser, fCase, fKind, fFirm, search].filter(Boolean).length;

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

  function Th({ id, label, style }: { id: string; label: string; style?: any }) {
    return (<th className="sortable" style={style} onClick={() => toggleSort(id)}>{label}{sort === id ? <span className="ar">{dir === "asc" ? "▲" : "▼"}</span> : null}</th>);
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
    if (!confirm("Delete this time entry?")) return;
    await fetch("/api/entries/" + id, { method: "DELETE" });
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

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <form className="card" data-tone="add" onSubmit={save}>
        <h2>Add time</h2>
        <div className="grid" style={{ gridTemplateColumns: "118px minmax(0,1fr) 88px 150px 118px" }}>
          <div><label className="f">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="f">Case</label><CaseCombo value={caseName} onChange={setCaseName} /></div>
          <div><label className="f">Hours</label><input type="number" step="0.01" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="0.25" /></div>
          <div><label className="f">Type</label><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">-</option>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div><label className="f">Firm</label><select value={firm} onChange={(e) => setFirm(e.target.value)}>{FIRMS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
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
              <div><label className="f">Type</label><select value={fKind} onChange={(e) => { setFKind(e.target.value); setPage(1); }}><option value="">All types</option>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label className="f">Firm</label><select value={fFirm} onChange={(e) => { setFFirm(e.target.value); setPage(1); }}><option value="">All firms</option>{FIRMS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
            </div>
            <div className="grid g2" style={{ marginTop: 9 }}>
              <div><label className="f">Case contains</label><input type="search" value={fCase} onChange={(e) => { setFCase(e.target.value); setPage(1); }} placeholder="e.g. Nichols" /></div>
              <div><label className="f">Entry text contains</label><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="e.g. deposition" /></div>
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
            <GroupPicker defs={GROUPS} value={groupId} onChange={(v) => { setGroupId(v); setFolded({}); }} />
            <button className="btn sm" onClick={() => window.print()}>Print / PDF</button>
            <button className="btn sm" disabled={syncing} onClick={syncNow}>{syncing ? "Syncing..." : "Sync Airtable"}</button>
          </div>
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr>
              <Th id="date" label="Date" style={{ width: 88 }} />
              <Th id="case" label="Case" style={{ width: 190 }} />
              <Th id="entry" label="Entry" />
              <Th id="hrs" label="Hrs" style={{ width: 54 }} />
              <Th id="who" label="Who" style={{ width: 112 }} />
              <Th id="type" label="Type" style={{ width: 128 }} />
              <th className="noprint" style={{ width: 58 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={7} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={7} className="muted">No entries match these filters.</td></tr>)
: groups.map((g) => (
                <Fragment key={"g" + g.key}>
                  {groupDef ? (
                    <GroupRow label={g.key} count={g.items.length} span={7} extra={g.items.reduce((n: number, x: any) => n + Number(x.duration || 0), 0).toFixed(2) + " hrs"}
                      collapsed={!!folded[g.key]} onToggle={() => setFolded({ ...folded, [g.key]: !folded[g.key] })} />
                  ) : null}
                  {folded[g.key] ? null : g.items.map((r) => editing === r.id ? (
                <tr key={r.id}><td colSpan={7}>
                  <div className="grid g4">
                    <div><label className="f">Date</label><input type="date" value={draft.entry_date || ""} onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })} /></div>
                    <div style={{ gridColumn: "span 2" }}><label className="f">Case</label><CaseCombo value={draft.case_name || ""} onChange={(v) => setDraft({ ...draft, case_name: v })} /></div>
                    <div><label className="f">Hours</label><input type="number" step="0.01" value={draft.duration ?? ""} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} /></div>
                  </div>
                  <div style={{ marginTop: 7 }}><label className="f">Entry</label><textarea value={draft.time_entry || ""} onChange={(e) => setDraft({ ...draft, time_entry: e.target.value })} /></div>
                  <div className="grid g3" style={{ marginTop: 7 }}>
                    <div><label className="f">Type</label><select value={draft.kind || ""} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}><option value="">-</option>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
                    <div><label className="f">Firm</label><select value={draft.firm || ""} onChange={(e) => setDraft({ ...draft, firm: e.target.value })}><option value="">-</option>{FIRMS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
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
                <tr key={r.id}>
                  <td className="date">{d10(r.entry_date)}</td>
                  <td>{r.case_name || <span className="muted">-</span>}</td>
                  <td>{r.time_entry}{r.url ? <> <a href={r.url} target="_blank" rel="noreferrer" className="small noprint">link</a></> : null}</td>
                  <td className="num">{r.duration === null ? "" : Number(r.duration).toFixed(2)}</td>
                  <td className="who">{r.user_name}</td>
                  <td><Chip v={r.kind} colors={choices[CF.timeKind]} dash={false} /></td>
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
