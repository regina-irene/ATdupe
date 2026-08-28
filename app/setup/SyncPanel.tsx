"use client";
import { useEffect, useState } from "react";

export default function SyncPanel() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  async function load() {
    try { const r = await fetch("/api/sync/status"); setData(await r.json()); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function call(path: string, key: string) {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch(path, { method: "POST" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (j.reset) setMsg({ kind: "ok", text: "Backfill progress cleared." });
      else if (j.mode === "backfill") setMsg({ kind: "ok", text: j.done ? `Backfill finished. ${Number(j.total_pulled).toLocaleString()} records read.` : `Backfill running: ${Number(j.total_pulled).toLocaleString()} so far. Press again to continue.` });
      else setMsg({ kind: "ok", text: `Pulled ${j.pulled}, sent ${j.pushed_new} new and ${j.pushed_upd} updates.` });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy("");
  }

  const c = data?.counts;
  const tk = data?.tasks;

  return (
    <>
      <div className="card" data-tone="sync">
        <h2>Time sync</h2>
        {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}
        {data?.backfill_in_progress ? (
          <div className="notice warn">Backfill part-way through: {Number(data.backfill_count || 0).toLocaleString()} records so far. Press <b>Full backfill</b> again to continue.</div>
        ) : null}
        {c ? (
          <div className="stats" style={{ marginBottom: 10 }}>
            <div className="stat"><b>{Number(c.total).toLocaleString()}</b><span>Entries</span></div>
            <div className="stat"><b>{Number(c.linked).toLocaleString()}</b><span>Linked to Airtable</span></div>
            <div className="stat"><b>{Number(c.own_entries).toLocaleString()}</b><span>Typed here</span></div>
            <div className="stat"><b>{Number(c.pending).toLocaleString()}</b><span>Waiting to send</span></div>
          </div>
        ) : null}
        {data?.last ? (
          <p className="small muted">Last run {new Date(data.last.ran_at).toLocaleString()}{data.last.error ? <span style={{ color: "var(--danger)" }}> - failed: {data.last.error}</span> : ` - pulled ${data.last.pulled}, sent ${data.last.pushed_new} new and ${data.last.pushed_upd} updates`}</p>
        ) : <p className="small muted">No time sync has run yet.</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={!!busy} onClick={() => call("/api/sync/time", "now")}>{busy === "now" ? "Syncing..." : "Sync now"}</button>
          <button className="btn" disabled={!!busy} onClick={() => call("/api/sync/time?full=1", "full")}>{busy === "full" ? "Running..." : "Full backfill"}</button>
          <button className="btn ghost sm" disabled={!!busy} onClick={() => call("/api/sync/time?reset=1", "reset")}>Restart backfill</button>
        </div>
      </div>

      <div className="card" data-tone="task">
        <h2>Task sync</h2>
        {tk ? (
          <div className="stats" style={{ marginBottom: 10 }}>
            <div className="stat"><b>{Number(tk.total).toLocaleString()}</b><span>Tasks</span></div>
            <div className="stat"><b>{Number(tk.open).toLocaleString()}</b><span>Open</span></div>
            <div className="stat"><b>{Number(tk.linked).toLocaleString()}</b><span>Linked to Airtable</span></div>
          </div>
        ) : null}
        {data?.lastTask ? (
          <p className="small muted">Last run {new Date(data.lastTask.ran_at).toLocaleString()}{data.lastTask.error ? <span style={{ color: "var(--danger)" }}> - failed: {data.lastTask.error}</span> : ` - pulled ${data.lastTask.pulled}, sent ${data.lastTask.pushed_new} new and ${data.lastTask.pushed_upd} updates`}</p>
        ) : <p className="small muted">No task sync has run yet. Press Sync tasks to load them.</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={!!busy} onClick={() => call("/api/sync/tasks", "tasks")}>{busy === "tasks" ? "Syncing..." : "Sync tasks"}</button>
          <span className="muted small">Reads the whole Tasks table each run, so Airtable edits come across too.</span>
        </div>
      </div>
    </>
  );
}
