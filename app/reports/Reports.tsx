"use client";
import { useEffect, useState } from "react";

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function Reports() {
  const t = today();
  const [groupBy, setGroupBy] = useState("case");
  const [from, setFrom] = useState(t.slice(0, 8) + "01");
  const [to, setTo] = useState(t);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true); setErr("");
    try {
      const p = new URLSearchParams({ groupBy });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const r = await fetch("/api/reports?" + p.toString());
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [groupBy, from, to]);

  const totalHours = rows.reduce((s, r) => s + Number(r.hours || 0), 0);
  const totalEntries = rows.reduce((s, r) => s + Number(r.entries || 0), 0);

  function download() {
    const csv = "Label,Entries,Hours\n" + rows.map((r) => '"' + String(r.label).replace(/"/g, '""') + '",' + r.entries + "," + Number(r.hours).toFixed(2)).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "efl-time-by-" + groupBy + ".csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="wrap">
      <div className="card noprint" data-tone="report">
        <h2>Report</h2>
        <div className="row">
          <div className="chips nowrap" style={{ marginTop: 0 }}>
            {[["case","By case"],["user","By person"],["month","By month"],["day","By day"],["firm","By firm"],["kind","By type"]].map(([k, label]) => (
              <button key={k} className={"chip " + (groupBy === k ? "on" : "")} onClick={() => setGroupBy(k as string)}>{label}</button>
            ))}
          </div>
          <div className="spacer" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 136 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 136 }} />
          <button className="btn sm" onClick={() => { setFrom(""); setTo(""); }}>All time</button>
          <button className="btn sm" onClick={download}>CSV</button>
          <button className="btn sm" onClick={() => window.print()}>PDF</button>
        </div>
      </div>
      {err ? <div className="notice err">{err}</div> : null}
      <div className="card" data-tone="report">
        <h2>Totals</h2>
        <div className="stats" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{Number(totalHours).toFixed(2)}</b><span>Total hours</span></div>
          <div className="stat"><b>{totalEntries.toLocaleString()}</b><span>Total entries</span></div>
          <div className="stat"><b>{rows.length.toLocaleString()}</b><span>Groups</span></div>
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{groupBy === "case" ? "Case" : groupBy === "user" ? "Person" : "Group"}</th><th style={{ width: 90 }}>Entries</th><th style={{ width: 90 }}>Hours</th><th style={{ width: 200 }} className="noprint">Share</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="muted">Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={4} className="muted">Nothing in this range.</td></tr>
                : rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">{Number(r.entries).toLocaleString()}</td>
                    <td className="num">{Number(r.hours).toFixed(2)}</td>
                    <td className="noprint"><div className="bar"><i style={{ width: (totalHours ? (Number(r.hours) / totalHours) * 100 : 0) + "%" }} /></div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
