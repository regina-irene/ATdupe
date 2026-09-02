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
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [fixes, setFixes] = useState<Record<string, { case_name: string; bill_date: string }>>({});

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

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.pdf$/i.test(f.name));
    if (!list.length) { setMsg({ kind: "err", text: "Drop PDF bills, not other files." }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("files", f);
      const j = await (await fetch("/api/gal-bills/upload", { method: "POST", body: fd })).json();
      if (j.error) throw new Error(j.error);
      setResults(j.results || []);
      const pending: Record<string, { case_name: string; bill_date: string }> = {};
      for (const r of j.results || []) {
        if (r.status === "needs-details") pending[r.file] = { case_name: r.case_name || "", bill_date: r.bill_date || "" };
      }
      setFixes(pending);
      const failed = (j.results || []).filter((r: any) => r.status === "failed" || r.status === "no-summary").length;
      setMsg({
        kind: failed || Object.keys(pending).length ? "warn" : "ok",
        text: `Read ${list.length} file${list.length > 1 ? "s" : ""}: ${j.saved} saved`
          + (Object.keys(pending).length ? `, ${Object.keys(pending).length} need a case name or date` : "")
          + (failed ? `, ${failed} could not be read` : "") + ".",
      });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  }

  // For a file whose case or date could not be worked out from its name.
  async function saveFix(r: any) {
    const f = fixes[r.file];
    if (!f?.case_name?.trim() || !f?.bill_date) { setMsg({ kind: "err", text: "Both a case name and a date are needed." }); return; }
    const j = await (await fetch("/api/gal-bills", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        case_name: f.case_name.trim(), bill_date: f.bill_date,
        subtotal: r.parsed?.subtotal ?? null, data: { parties: r.parsed?.parties || {} },
      }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setResults((cur) => cur.map((x) => (x.file === r.file ? { ...x, status: "saved" } : x)));
    setMsg({ kind: "ok", text: `Saved ${f.case_name.trim()}.` });
    load();
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
          <button className="btn primary sm" onClick={() => setAdding(!adding)}>{adding ? "Close" : "Upload bills"}</button>
        </div>

        {adding ? (
          <>
            <div className={"dropzone" + (over ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
              onClick={() => document.getElementById("galfiles")?.click()}>
              <input id="galfiles" type="file" accept="application/pdf" multiple hidden
                onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.currentTarget.value = ""; }} />
              <b>{busy ? "Reading the bills..." : "Drop GAL bills here, or click to choose"}</b>
              <span className="muted small">
                PDFs, as many as you like at once. The case and the as-of date come from the file name,
                so <code>2026.06.05 GAL Billing (Buchanan).pdf</code> needs nothing typed at all.
              </span>
            </div>

            {results.length ? (
              <div className="feed" style={{ marginTop: 10 }}>
                {results.map((r) => (
                  <div className="feedrow" key={r.file} style={{ cursor: "default", flexWrap: "wrap" }}>
                    <span className={"tag " + (r.status === "saved" ? "k-task" : r.status === "needs-details" ? "k-docs" : "k-objections")}>
                      {r.status === "saved" ? "Saved" : r.status === "needs-details" ? "Needs details" : r.status === "no-summary" ? "No summary" : "Failed"}
                    </span>
                    <span className="feedmain">
                      <b>{r.case_name || r.file}</b>
                      <span className="muted small">
                        {r.file}
                        {r.parsed ? " · " + Object.entries(r.parsed.parties || {}).map(([n, p]: any) =>
                          `${n}: ${p.payments.length} payments, due ${money(p.totalDue)}`).join(" · ") : ""}
                        {r.why ? " · " + r.why : ""}
                      </span>
                    </span>
                    {r.status === "needs-details" ? (
                      <span className="row" style={{ width: "100%", marginTop: 6 }}>
                        <input type="text" placeholder="Case name" value={fixes[r.file]?.case_name || ""}
                          onChange={(e) => setFixes({ ...fixes, [r.file]: { ...fixes[r.file], case_name: e.target.value } })}
                          style={{ maxWidth: 220 }} />
                        <input type="date" value={fixes[r.file]?.bill_date || ""}
                          onChange={(e) => setFixes({ ...fixes, [r.file]: { ...fixes[r.file], bill_date: e.target.value } })}
                          style={{ maxWidth: 160 }} />
                        <button className="btn primary sm" onClick={() => saveFix(r)}>Save</button>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {loading ? <p className="muted">Loading...</p>
        : shown.length === 0 ? (
          <div className="card" data-tone="gal"><p className="muted" style={{ margin: 0 }}>
            No GAL bills yet. Use <b>Upload bills</b> and drop the PDFs in.
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
