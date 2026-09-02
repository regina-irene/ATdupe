"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Party = { payments: { date: string; amount: number }[]; balance: number | null; totalDue: number | null; retainer?: number | null; initial?: number | null };
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
  const [paid, setPaid] = useState<any[]>([]);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pform, setPform] = useState<any>({ party: "", paid_on: "", amount: "", method: "", note: "" });
  const [bulk, setBulk] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [latestOnly, setLatestOnly] = useState(true);

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [fixes, setFixes] = useState<Record<string, { case_name: string; bill_date: string }>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, k] = await Promise.all([
        (await fetch("/api/gal-bills")).json(),
        (await fetch("/api/gal-payments")).json(),
      ]);
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
      setPaid(k.rows || []);
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

  async function addPayment(caseName: string) {
    const body = pform.party && pform.paid_on && pform.amount
      ? { case_name: caseName, ...pform }
      : null;
    if (!body) { setMsg({ kind: "err", text: "A party, a date and an amount are needed." }); return; }
    const j = await (await fetch("/api/gal-payments", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setPform({ party: "", paid_on: "", amount: "", method: "", note: "" });
    setMsg({ kind: "ok", text: "Payment recorded." });
    load();
  }

  // "Father 6/30/2026 2500 zelle", one per line.
  async function addBulk(caseName: string) {
    const payments = bulk.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^([A-Za-z][A-Za-z']*)\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s+\$?\s*([\d,]+(?:\.\d{2})?)\s*(.*)$/);
      if (!m) return null;
      const d = m[2].split(/[\/.-]/);
      const yr = d[2].length === 2 ? "20" + d[2] : d[2];
      return {
        case_name: caseName, party: m[1],
        paid_on: `${yr}-${d[0].padStart(2, "0")}-${d[1].padStart(2, "0")}`,
        amount: Number(m[3].replace(/,/g, "")), method: m[4] || null,
      };
    }).filter(Boolean);
    if (!payments.length) { setMsg({ kind: "err", text: "Use: Father 6/30/2026 2500 zelle, one per line." }); return; }
    const j = await (await fetch("/api/gal-payments", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payments }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setBulk("");
    setMsg({ kind: "ok", text: `Recorded ${j.added} payment${j.added > 1 ? "s" : ""}.` });
    load();
  }

  async function dropPayment(id: number) {
    if (!confirm("Remove this payment?")) return;
    const j = await (await fetch("/api/gal-payments/" + id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  // Payments taken after the bill's as-of date, per party.
  function since(b: Bill, partyName: string) {
    return paid.filter((p) =>
      p.case_name.toLowerCase() === b.case_name.toLowerCase() &&
      String(p.party).toLowerCase() === partyName.toLowerCase() &&
      p.paid_on > b.bill_date);
  }

  function startEdit(b: Bill) {
    const initials: Record<string, string> = {};
    for (const [n, p] of Object.entries(b.data?.parties || {})) initials[n] = p.initial == null ? "" : String(p.initial);
    setDraft({ case_name: b.case_name, bill_date: b.bill_date, initials });
    setEditing(b.id);
  }
  async function saveEdit(b: Bill) {
    const j = await (await fetch("/api/gal-bills/" + b.id, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ case_name: draft.case_name, bill_date: draft.bill_date, initials: draft.initials }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setEditing(null); load();
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
    let billed = 0, collected = 0, owing = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const k = r.case_name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      for (const [name, p] of Object.entries(r.data?.parties || {})) {
        const due = Number(p.totalDue || 0);
        const later = paid.filter((x) =>
          x.case_name.toLowerCase() === k &&
          String(x.party).toLowerCase() === name.toLowerCase() &&
          x.paid_on > r.bill_date);
        const sum = later.reduce((n, x) => n + Number(x.amount || 0), 0);
        billed += due;
        collected += sum;
        owing += Math.max(0, due - sum);
      }
    }
    return { billed, collected, owing, cases: seen.size };
  }, [rows, paid]);

  const partyNames = (b: Bill) => Object.keys(b.data?.parties || {});

  return (
    <div className="wrap wide">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="gal">
        <div className="row">
          <div className="stats">
            <div className="stat"><b>{totals.cases}</b><span>Cases</span></div>
            <div className="stat"><b>{money(totals.billed)}</b><span>Requested at billing</span></div>
            <div className="stat"><b>{money(totals.collected)}</b><span>Paid since</span></div>
            <div className="stat"><b className={totals.owing > 0 ? "hot" : "paidoff"}>{money(totals.owing)}</b><span>Still owing</span></div>
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
                <button className="btn sm noprint" onClick={() => setPayFor(payFor === b.case_name ? null : b.case_name)}>
                  {payFor === b.case_name ? "Close" : "Record payment"}
                </button>
                <button className="btn ghost sm noprint" onClick={() => startEdit(b)}>Edit</button>
                <button className="btn ghost sm noprint" onClick={() => remove(b)}>Remove</button>
              </div>

              {payFor === b.case_name ? (
                <div className="card noprint" data-tone="pay" style={{ marginBottom: 9, boxShadow: "none" }}>
                  <div className="row" style={{ flexWrap: "wrap", gap: 7 }}>
                    <div><label className="f">Party</label>
                      <select value={pform.party} onChange={(e) => setPform({ ...pform, party: e.target.value })} style={{ width: 120 }}>
                        <option value="">-</option>
                        {Object.keys(b.data?.parties || {}).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select></div>
                    <div><label className="f">Paid on</label>
                      <input type="date" value={pform.paid_on} style={{ width: 150 }}
                        onChange={(e) => setPform({ ...pform, paid_on: e.target.value })} /></div>
                    <div><label className="f">Amount</label>
                      <input type="number" step="0.01" value={pform.amount} style={{ width: 120 }}
                        onChange={(e) => setPform({ ...pform, amount: e.target.value })} /></div>
                    <div><label className="f">How</label>
                      <input type="text" value={pform.method} style={{ width: 130 }} placeholder="card, Zelle, check"
                        onChange={(e) => setPform({ ...pform, method: e.target.value })} /></div>
                    <div style={{ alignSelf: "flex-end" }}>
                      <button className="btn primary sm" onClick={() => addPayment(b.case_name)}>Add</button>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 7, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}><label className="f">Or paste several, one per line</label>
                      <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} style={{ minHeight: 56 }}
                        placeholder="Father 6/30/2026 2500 zelle" /></div>
                    <button className="btn sm" onClick={() => addBulk(b.case_name)}>Add all</button>
                  </div>
                </div>
              ) : null}

              {editing === b.id ? (
                <div className="row noprint" style={{ marginBottom: 9, flexWrap: "wrap", gap: 7 }}>
                  <div><label className="f">Case</label>
                    <input type="text" value={draft.case_name || ""} style={{ width: 170 }}
                      onChange={(e) => setDraft({ ...draft, case_name: e.target.value })} /></div>
                  <div><label className="f">As of</label>
                    <input type="date" value={draft.bill_date || ""} style={{ width: 150 }}
                      onChange={(e) => setDraft({ ...draft, bill_date: e.target.value })} /></div>
                  {Object.keys(b.data?.parties || {}).map((n) => (
                    <div key={n}><label className="f">{n} initial retainer</label>
                      <input type="number" step="0.01" style={{ width: 130 }} value={draft.initials?.[n] ?? ""}
                        onChange={(e) => setDraft({ ...draft, initials: { ...draft.initials, [n]: e.target.value } })} /></div>
                  ))}
                  <div style={{ alignSelf: "flex-end" }}>
                    <button className="btn primary sm" onClick={() => saveEdit(b)}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : null}

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
                          ) : p.payments.map((x, i) => {
                            const isInitial = p.initial != null && Number(x.amount) === Number(p.initial)
                              && p.payments.findIndex((y) => Number(y.amount) === Number(p.initial)) === i;
                            return (
                              <tr key={i}>
                                <td className="date">{shortDate(x.date)}{isInitial ? <span className="muted small"> · retainer</span> : null}</td>
                                <td className="money">{money(x.amount)}</td>
                              </tr>
                            );
                          })}
                          <tr className="sumrow"><td>Paid to date</td><td className="money">{money(paid)}</td></tr>
                        </tbody>
                      </table>
                      {since(b, name).length ? (
                        <table className="data mini">
                          <thead><tr><th>Paid since this bill</th><th className="money">Amount</th></tr></thead>
                          <tbody>
                            {since(b, name).map((x) => (
                              <tr key={x.id}>
                                <td className="date">{shortDate(x.paid_on)}
                                  {x.method ? <span className="muted small"> · {x.method}</span> : null}
                                  <button className="twist noprint" title="Remove" onClick={() => dropPayment(x.id)}>&times;</button>
                                </td>
                                <td className="money">{money(x.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                      <div className="partyfoot">
                        <div><span>Initial retainer</span><b>{p.initial == null ? "-" : money(p.initial)}</b></div>
                        <div><span>Balance</span><b className={p.balance !== null && p.balance > 0 ? "hot" : ""}>
                          {p.balance === null ? "-" : p.balance < 0 ? money(-p.balance) + " credit" : money(p.balance)}
                        </b></div>
                        {p.retainer ? <div><span>Retainer asked</span><b>{money(p.retainer)}</b></div> : null}
                        <div className="due"><span>Due at billing</span><b>{money(p.totalDue)}</b></div>
                        {(() => {
                          const later = since(b, name);
                          const sum = later.reduce((n, x) => n + Number(x.amount || 0), 0);
                          if (!later.length) return null;
                          const left = Number(p.totalDue || 0) - sum;
                          const last = later.map((x) => x.paid_on).sort().slice(-1)[0];
                          return (
                            <>
                              <div><span>Paid since</span><b>{money(sum)}</b></div>
                              <div className="due">
                                <span>Now owing</span>
                                <b className={left <= 0.005 ? "paidoff" : ""}>
                                  {left <= 0.005 ? "Paid in full" : money(left)}
                                </b>
                              </div>
                              <div><span>Last payment</span><b>{shortDate(last)}</b></div>
                            </>
                          );
                        })()}
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
