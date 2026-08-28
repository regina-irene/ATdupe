"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TASK_USERS, prioClass } from "../../lib/constants";

const d10 = (v: any) => (v ? String(v).slice(0, 10) : "");
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Short, glanceable "when did this last change".
function ago(v: any): string {
  if (!v) return "";
  const t = new Date(v).getTime();
  if (isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 7) return d + "d ago";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function stamp(v: any): string {
  if (!v) return "";
  const t = new Date(v);
  return isNaN(t.getTime()) ? "" : t.toLocaleString();
}

type View = { id: number; name: string; owner?: string; params: any };

const BLANK = { who: "", status: "", priority: "", caseQ: "", q: "", showClosed: false, sort: "order" };

export default function Tasks() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<{ statuses: string[]; priorities: string[] }>({ statuses: [], priorities: [] });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const [who, setWho] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [caseQ, setCaseQ] = useState("");
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState("order");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [views, setViews] = useState<View[]>([]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [syncing, setSyncing] = useState(false);

  const current = useMemo(() => ({ who, status, priority, caseQ, q, showClosed, sort }), [who, status, priority, caseQ, q, showClosed, sort]);
  const isBlank = useMemo(() => JSON.stringify(current) === JSON.stringify(BLANK), [current]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (who) p.set("who", who);
    if (status) p.set("status", status);
    if (priority) p.set("priority", priority);
    if (caseQ) p.set("case", caseQ);
    if (q) p.set("q", q);
    if (showClosed) p.set("closed", "1");
    p.set("sort", sort);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [who, status, priority, caseQ, q, showClosed, sort, page]);

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
  }, []);

  const loadViews = useCallback(() => {
    fetch("/api/views?page=tasks").then((r) => r.json()).then((j) => { if (!j.error) setViews(j.rows || []); }).catch(() => {});
  }, []);
  useEffect(() => { loadViews(); }, [loadViews]);

  function applyView(v: View) {
    const p = { ...BLANK, ...(v.params || {}) };
    setWho(p.who || "");
    setStatus(p.status || "");
    setPriority(p.priority || "");
    setCaseQ(p.caseQ || "");
    setQ(p.q || "");
    setShowClosed(!!p.showClosed);
    setSort(p.sort || "order");
    setPage(1);
  }
  function clearAll() {
    setWho(""); setStatus(""); setPriority(""); setCaseQ(""); setQ("");
    setShowClosed(false); setSort("order"); setPage(1);
  }
  function matches(v: View) {
    return JSON.stringify({ ...BLANK, ...(v.params || {}) }) === JSON.stringify(current);
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
  async function saveEdit(id: number) { if (await patch(id, draft)) { setEditing(null); load(); } }
  async function toggleClosed(t: any) { if (await patch(t.id, { closed: !t.closed })) load(); }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/sync/tasks", { method: "POST" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Pulled ${j.pulled} from Airtable, sent ${j.pushed_new} new and ${j.pushed_upd} updates.` });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setSyncing(false);
  }

  const today = todayStr();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="task">
        <h2>Saved views</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            <button className={"chip " + (isBlank ? "on" : "")} onClick={clearAll}>All open</button>
            {views.map((v) => (
              <span key={v.id} className="viewchip">
                <button className={"chip " + (matches(v) ? "on" : "")} title={v.owner ? "Saved by " + v.owner : ""} onClick={() => applyView(v)}>{v.name}</button>
                <button className="x" title={"Delete the view " + v.name} onClick={() => deleteView(v)}>&times;</button>
              </span>
            ))}
            {views.length === 0 ? <span className="muted small">Set your filters below, then save them here as a one-click button.</span> : null}
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
            {TASK_USERS.map((u) => (
              <button key={u} className={"chip " + (who === u ? "on" : "")} onClick={() => { setWho(u); setPage(1); }}>{u}</button>
            ))}
          </div>
          <div className="spacer" />
          <button className={"chip " + (showClosed ? "on" : "")} onClick={() => { setShowClosed(!showClosed); setPage(1); }}>{showClosed ? "Showing closed" : "Open only"}</button>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ width: 150 }}>
            <option value="order">Sort: Order</option>
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="case">Sort: Case</option>
            <option value="modified">Sort: Recently changed</option>
          </select>
        </div>
        <div className="grid g4" style={{ marginTop: 9 }}>
          <div><label className="f">Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="f">Priority</label>
            <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="">All priorities</option>
              {meta.priorities.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="f">Case contains</label><input type="search" value={caseQ} onChange={(e) => { setCaseQ(e.target.value); setPage(1); }} placeholder="e.g. Nichols" /></div>
          <div><label className="f">Task text contains</label><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="e.g. discovery" /></div>
        </div>
      </div>

      <div className="card" data-tone="task">
        <h2>Tasks</h2>
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats"><div className="stat"><b>{total.toLocaleString()}</b><span>{showClosed ? "Tasks" : "Open tasks"}</span></div></div>
          <div className="spacer" />
          <div className="row noprint">
            <button className="btn sm" onClick={() => window.print()}>Print / PDF</button>
            <button className="btn sm" disabled={syncing} onClick={syncNow}>{syncing ? "Syncing..." : "Sync Airtable"}</button>
          </div>
        </div>

        <div className="tablewrap">
          <table className="data">
            <thead><tr>
              <th style={{ width: 128 }}>Priority</th>
              <th style={{ width: 180 }}>Case</th>
              <th>Task</th>
              <th style={{ width: 170 }}>Status</th>
              <th style={{ width: 62 }}>Who</th>
              <th style={{ width: 88 }}>Due</th>
              <th style={{ width: 92 }}>Modified</th>
              <th className="noprint" style={{ width: 120 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={8} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={8} className="muted">No tasks match these filters.</td></tr>)
                : rows.map((t) => editing === t.id ? (
                <tr key={t.id}><td colSpan={8}>
                  <div className="grid g4">
                    <div><label className="f">Status</label>
                      <select value={draft.status || ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        <option value="">-</option>
                        {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Priority</label>
                      <select value={draft.priority || ""} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                        <option value="">-</option>
                        {meta.priorities.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Who</label>
                      <select value={draft.who || ""} onChange={(e) => setDraft({ ...draft, who: e.target.value })}>
                        <option value="">-</option>
                        {TASK_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
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
                <tr key={t.id} className={prioClass(t.priority) + (!t.closed && t.due_date && d10(t.due_date) < today ? " overdue" : "")}>
                  <td className="small">{t.priority || <span className="muted">-</span>}</td>
                  <td>{t.case_name || t.client_name || <span className="muted">-</span>}</td>
                  <td>{t.task}{t.link ? <> <a href={t.link} target="_blank" rel="noreferrer" className="small noprint">file</a></> : null}</td>
                  <td className="small">{t.status || <span className="muted">-</span>}</td>
                  <td className="who">{t.who}</td>
                  <td className="date">{d10(t.due_date)}</td>
                  <td className="date muted" title={stamp(t.updated_at)}>{ago(t.updated_at)}</td>
                  <td className="noprint">
                    <button className="btn ghost sm" onClick={() => { setEditing(t.id); setDraft({ status: t.status, priority: t.priority, who: t.who, due_date: d10(t.due_date), task: t.task }); }}>Edit</button>
                    <button className="btn ghost sm" title={t.closed ? "Reopen" : "Mark closed"} onClick={() => toggleClosed(t)}>{t.closed ? "Reopen" : "Done"}</button>
                  </td>
                </tr>
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
