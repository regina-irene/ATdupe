"use client";
import { useCallback, useEffect, useState } from "react";
import MirrorBoard from "../../MirrorBoard";

type Tbl = { id: string; name: string; rows: number };
type Board = { base_id: string; label: string; case_name: string | null; note: string | null; last_sync: string | null };

export default function BoardDetail({ base }: { base: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [tables, setTables] = useState<Tbl[]>([]);
  const [pick, setPick] = useState<string>("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [cases, setCases] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const [caseName, setCaseName] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/client-boards/" + base)).json();
      if (j.error) throw new Error(j.error);
      setBoard(j.board);
      setCaseName(j.board?.case_name || "");
      setTables(j.tables || []);
      setPick((cur) => cur || (j.tables || []).find((t: Tbl) => t.rows > 0)?.id || (j.tables || [])[0]?.id || "");
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/cases?limit=1000").then((r) => r.json()).then((j) => setCases(j.cases || [])).catch(() => {});
  }, []);

  async function syncTable(t: Tbl) {
    setBusy(t.id);
    try {
      const j = await (await fetch("/api/sync/mirror/b:" + base + ":" + t.id, { method: "POST" })).json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `${t.name}: pulled ${j.pulled}, sent ${j.pushed_new} new and ${j.pushed_upd} updates.` });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: `${t.name}: ${e.message}` }); }
    setBusy("");
  }

  async function syncAll() {
    setBusy("all");
    let pulled = 0;
    for (const t of tables) {
      try {
        const j = await (await fetch("/api/sync/mirror/b:" + base + ":" + t.id, { method: "POST" })).json();
        if (!j.error) pulled += j.pulled || 0;
      } catch {}
    }
    setMsg({ kind: "ok", text: `Synced ${tables.length} tables, ${pulled} rows in total.` });
    setBusy(""); load();
  }

  async function saveLink() {
    const j = await (await fetch("/api/client-boards/" + base, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: board?.label, case_name: caseName || null, note: board?.note ?? null }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setLinking(false); load();
  }

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="board">
        <div className="row">
          <div>
            <h2 style={{ margin: 0 }}>{board?.label || base}</h2>
            <div className="muted small" style={{ marginTop: 3 }}>
              {board?.case_name
                ? <>Case: <a href={"/cases?q=" + encodeURIComponent(board.case_name)}>{board.case_name}</a></>
                : "Not linked to a case"}
              {" · "}
              <a href={"https://airtable.com/" + base} target="_blank" rel="noreferrer">Open in Airtable</a>
              {" · "}<a href="/boards">All boards</a>
            </div>
          </div>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setLinking(!linking)}>{linking ? "Close" : "Link to a case"}</button>
          <button className="btn sm" disabled={!!busy} onClick={syncAll}>{busy === "all" ? "Syncing all..." : "Sync every table"}</button>
        </div>
        {linking ? (
          <div className="row" style={{ marginTop: 9 }}>
            <div style={{ flex: 1 }}><label className="f">Case</label>
              <input type="text" list="allcases2" value={caseName} onChange={(e) => setCaseName(e.target.value)} placeholder="Start typing" />
              <datalist id="allcases2">{cases.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <button className="btn primary sm" onClick={saveLink}>Save</button>
          </div>
        ) : null}

        <div className="chips" style={{ marginTop: 11 }}>
          {tables.map((t) => (
            <span key={t.id} className="viewchip">
              <button className={"chip " + (pick === t.id ? "on" : "")} onClick={() => setPick(t.id)}>
                {t.name}{t.rows ? " · " + t.rows.toLocaleString() : ""}
              </button>
              <button className="x" title={"Sync " + t.name} disabled={!!busy} onClick={() => syncTable(t)}>
                {busy === t.id ? "..." : "↻"}
              </button>
            </span>
          ))}
          {tables.length === 0 ? <span className="muted small">No tables found, or the token cannot read this base.</span> : null}
        </div>
        <div className="muted small" style={{ marginTop: 7 }}>
          Pick a table to work with it. The arrow beside each one pulls that table from Airtable.
        </div>
      </div>

      {pick ? <MirrorBoard key={pick} boardKey={"b:" + base + ":" + pick} /> : null}
    </div>
  );
}
