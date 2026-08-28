"use client";
import { useState } from "react";

export default function Wipe() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("imported");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  async function wipe() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/import/wipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm, scope }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Deleted ${Number(j.deleted).toLocaleString()} entries. ${Number(j.remaining).toLocaleString()} remain.` });
      setConfirm("");
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  }

  return (
    <div className="card" data-tone="danger">
      <h2>Start over</h2>
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}
      {!open ? (
        <div className="row">
          <button className="btn" onClick={() => setOpen(true)}>Wipe entries and reload</button>
          <span className="muted small">Clears this app&rsquo;s database only. Nothing in Airtable is deleted or changed.</span>
        </div>
      ) : (
        <>
          <p className="small"><b>This deletes rows from the time board&rsquo;s own database.</b> Your Airtable Time table is not touched, so anything cleared here can be reloaded with Full backfill.</p>
          <div className="grid g2">
            <div>
              <label className="f">What to delete</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="imported">Everything that came from Airtable</option>
                <option value="all">Absolutely everything, including entries typed here</option>
              </select>
            </div>
            <div>
              <label className="f">Type DELETE to confirm</label>
              <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn danger" disabled={busy || confirm !== "DELETE"} onClick={wipe}>{busy ? "Deleting..." : "Delete now"}</button>
            <button className="btn ghost" onClick={() => { setOpen(false); setConfirm(""); }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
