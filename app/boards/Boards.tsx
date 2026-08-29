"use client";
import { useCallback, useEffect, useState } from "react";

type Board = { id: number; base_id: string; label: string; case_name: string | null; note: string | null; last_sync: string | null; last_result: string | null; rows: number };

const when = (v: any) => (v ? new Date(v).toLocaleString() : "never");

export default function Boards() {
  const [rows, setRows] = useState<Board[]>([]);
  const [cases, setCases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ url: "", label: "", case_name: "" });

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

  async function add() {
    if (!form.url.trim()) { setMsg({ kind: "err", text: "Paste the Airtable link for the board." }); return; }
    setBusy(true);
    try {
      const j = await (await fetch("/api/client-boards", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      })).json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Added ${j.board.label}. It has ${j.tables.length} tables. Open it to sync them.` });
      setForm({ url: "", label: "", case_name: "" });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  }

  async function remove(b: Board) {
    if (!confirm(`Remove "${b.label}" and delete its ${b.rows.toLocaleString()} mirrored rows? Airtable is not touched.`)) return;
    const j = await (await fetch("/api/client-boards/" + b.base_id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="board">
        <h2>Add a client board</h2>
        <div className="grid g4">
          <div style={{ gridColumn: "span 2" }}><label className="f">Airtable link or base id</label>
            <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://airtable.com/appXXXXXXXXXXXXXX" /></div>
          <div><label className="f">Name it</label>
            <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Leave blank to use the base name" /></div>
          <div><label className="f">Matching case</label>
            <input type="text" list="allcases" value={form.case_name} onChange={(e) => setForm({ ...form, case_name: e.target.value })}
              placeholder="Start typing" />
            <datalist id="allcases">{cases.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="row" style={{ marginTop: 9 }}>
          <button className="btn primary sm" disabled={busy} onClick={add}>{busy ? "Checking access..." : "Add board"}</button>
          <div className="spacer" />
          <span className="muted small">Nothing is copied until you open the board and sync a table.</span>
        </div>
      </div>

      <div className="card" data-tone="board">
        <h2>Client boards</h2>
        <div className="tablewrap">
          <table className="data">
            <thead><tr>
              <th>Board</th><th style={{ width: 240 }}>Case</th><th style={{ width: 90 }}>Rows</th>
              <th style={{ width: 170 }}>Last sync</th><th style={{ width: 200 }}>Result</th><th className="noprint" style={{ width: 150 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={6} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={6} className="muted">No client boards yet. Paste one above.</td></tr>)
                : rows.map((b) => (
                <tr key={b.base_id}>
                  <td><a href={"/boards/" + b.base_id}><b>{b.label}</b></a>
                    <div className="muted small">{b.base_id}</div></td>
                  <td>{b.case_name
                    ? <a href={"/cases?q=" + encodeURIComponent(b.case_name)}>{b.case_name}</a>
                    : <span className="muted">not linked</span>}</td>
                  <td className="money">{b.rows.toLocaleString()}</td>
                  <td className="date small">{when(b.last_sync)}</td>
                  <td className="small muted">{b.last_result || ""}</td>
                  <td className="noprint">
                    <a className="btn ghost sm" href={"/boards/" + b.base_id}>Open</a>
                    <button className="btn ghost sm" onClick={() => remove(b)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
