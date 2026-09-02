"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Party = { payments: { date: string; amount: number }[]; balance: number | null; totalDue: number | null; retainer: number | null };
type Bill = {
  id: number; case_name: string; bill_date: string; subtotal: number | null;
  data: { parties?: Record<string, Party> }; note: string | null; updated_by: string | null;
};

const money = (v: any) =>
  v === null || v === undefined || v === "" ? "" :
  Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" });
const shortDate = (v: string) => {
  if (!v) return "";
  const t = new Date(v + (v.length === 10 ? "T12:00:00" : ""));
  return isNaN(t.getTime()) ? v : t.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

export default function GalPayments() {
  const [rows, setRows] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [latestOnly, setLatestOnly] = useState(true);

  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [caseName, setCaseName] = useState("");
  const [billDate, setBillDate] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch("/api/gal-bills")).json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function parse() {
    setBusy(true);
    try {
      const j = await (await fetch("/api/gal-bills/parse", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }),
      })).json();
      if (j.error) throw new Error(j.error);
      setPreview(j.parsed);
      if (!caseName && j.parsed.caseName) setCaseName(j.parsed.caseName);
      if (!billDate && j.parsed.billDate) setBillDate(j.parsed.billDate);
      setMsg(null);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); setPreview(null); }
    setBusy(false);
  }

  async function save() {
    if (!preview) { setMsg({ kind: "err", text: "Read the bill first." }); return; }
    if (!caseName.trim() || !billDate) { setMsg({ kind: "err", text: "A case name and bill date are needed." }); return; }
    setBusy(true);
    try {
      const j = await (await fetch("/api/gal-bills", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ case_name: caseName.trim(), bill_date: billDate, subtotal: preview.subtotal, data: { parties: preview.parties }, note }),
      })).json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Saved ${caseName.trim()} as of ${shortDate(billDate)}.` });
      setText(""); setPreview(null); setCaseName(""); setBillDate(""); setNote(""); setAdding(false);
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  }

  async function remove(b: Bill) {
    if (!confirm(`Remove the ${b.case_name} bill dated ${shortDate(b.bill_date)}?`)) return;
    const j = await (await fetch("/api/gal-bills/" + b.id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  // One card per case. By default only the most recent bill for each.
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = t ? rows.filter((r) => r.case_name.toLowerCase().indexOf(t) >= 0) : rows;
    if (latestOnly) {
      const seen = new Set<string>();
      list = list.filter((r) => {
        const k = r.case_name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    }
    return list;
  }, [rows, q, latestOnly]);

  const totals = useMemo(() => {
    let due = 0, owed = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const k = r.case_name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      for (const p of Object.values(r.data?.parties || {})) {
        if (p.totalDue) due += p.totalDue;
        if (p.balance !== null && p.balance !== undefined && p.balance > 0) owed += p.balance;
      }
    }
    return { due, owed, cases: seen.size };
  }, [rows]);

  const partyNames = (b: Bill) => Object.keys(b.data?.parties || {});

  return (
    <div className="wrap wide">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="gal">
        <div className="row">
          <div className="stats">
            <div className="stat"><b>{totals.cases}</b><span>Cases</span></div>
            <div className="stat"><b>{money(totals.due)}</b><span>Total requested</span></div>
            <div className="stat"><b>{money(totals.owed)}</b><span>Past due</span></div>
          </div>
          <div className="spacer" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a case" style={{ width: 160 }} />
          <button className={"chip " + (latestOnly ? "on" : "")} onClick={() => setLatestOnly(!latestOnly)}>
            {latestOnly ? "Latest bill only" : "Every bill"}
          </button>
          <button className="btn sm" onClick={() => window.print()}>Print</button>
          <button className="btn primary sm" onClick={() => setAdding(!adding)}>{adding ? "Close" : "Add a bill"}</button>
        </div>

        {adding ? (
          <>
            <div className="grid g4" style={{ marginTop: 11 }}>
              <div><label className="f">Case</label>
                <input type="text" value={caseName} onChange={(e) => setCaseName(e.target.value)} placeholder="e.g. Buchanan" /></div>
              <div><label className="f">Bill date (amounts as of)</label>
                <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="f">Note</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
            </div>
            <div style={{ marginTop: 7 }}>
              <label className="f">Paste the bill</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 130 }}
                placeholder="Open the PDF, select all, copy, and paste here. Only the payment summary at the end matters." />
            </div>
            <div className="row" style={{ marginTop: 9 }}>
              <button className="btn sm" disabled={busy} onClick={parse}>{busy ? "Reading..." : "Read the bill"}</button>
              <button className="btn primary sm" disabled={busy || !preview} onClick={save}>Save</button>
              <div className="spacer" />
              <span className="muted small">Saving again for the same case and date replaces that bill.</span>
            </div>

            {preview ? (
              <div className="draft" style={{ marginTop: 9 }}>
                <b>Found:</b> subtotal {money(preview.subtotal)} ·{" "}
                {Object.entries(preview.parties).map(([n, p]: any) => (
                  <span key={n}>{n}: {p.payments.length} payments, balance {money(p.balance)}, due {money(p.totalDue)}. </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {loading ? <p className="muted">Loading...</p>
        : shown.length === 0 ? (
          <div className="card" data-tone="gal"><p className="muted" style={{ margin: 0 }}>
            No GAL bills yet. Use <b>Add a bill</b> and paste the first one.
          </p></div>
        ) : (
        <div className="galgrid">
          {shown.map((b) => (
            <div className="card" data-tone="gal" key={b.id}>
              <div className="row" style={{ marginBottom: 7 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{b.case_name}</h2>
                  <div className="muted small">As of {shortDate(b.bill_date)}{b.subtotal ? " · billed " + money(b.subtotal) : ""}{b.note ? " · " + b.note : ""}</div>
                </div>
                <div className="spacer" />
                <button className="btn ghost sm noprint" onClick={() => remove(b)}>Remove</button>
              </div>

              <div className="partycols">
                {partyNames(b).map((name) => {
                  const p = b.data.parties![name];
                  const paid = p.payments.reduce((n, x) => n + Number(x.amount || 0), 0);
                  return (
                    <div className="partycol" key={name}>
                      <div className="partyhead">{name}</div>
                      <table className="data mini">
                        <thead><tr><th>Payment date</th><th className="money">Amount</th></tr></thead>
                        <tbody>
                          {p.payments.length === 0 ? (
                            <tr><td colSpan={2} className="muted">No payments recorded.</td></tr>
                          ) : p.payments.map((x, i) => (
                            <tr key={i}><td className="date">{shortDate(x.date)}</td><td className="money">{money(x.amount)}</td></tr>
                          ))}
                          <tr className="sumrow"><td>Paid to date</td><td className="money">{money(paid)}</td></tr>
                        </tbody>
                      </table>
                      <div className="partyfoot">
                        <div><span>Balance</span><b className={p.balance !== null && p.balance > 0 ? "hot" : ""}>
                          {p.balance === null ? "-" : p.balance < 0 ? money(-p.balance) + " credit" : money(p.balance)}
                        </b></div>
                        {p.retainer ? <div><span>Retainer asked</span><b>{money(p.retainer)}</b></div> : null}
                        <div className="due"><span>Total due</span><b>{money(p.totalDue)}</b></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
