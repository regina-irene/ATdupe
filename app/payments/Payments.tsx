"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MultiSelect from "../MultiSelect";
import Chip, { useChoices } from "../Chip";
import { CF } from "../../lib/constants";

const money = (v: any) =>
  v === null || v === undefined || v === "" ? "" :
  Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" });

function when(v: any): string {
  if (!v) return "";
  const t = new Date(v);
  if (isNaN(t.getTime())) return "";
  const y = String(t.getFullYear()).slice(2);
  const mins = String(t.getMinutes()).padStart(2, "0");
  const ap = t.getHours() >= 12 ? "PM" : "AM";
  const h12 = t.getHours() % 12 || 12;
  return `${t.getMonth() + 1}/${t.getDate()}/${y} ${h12}:${mins} ${ap}`;
}
const stamp = (v: any) => { const t = new Date(v); return v && !isNaN(t.getTime()) ? t.toLocaleString() : ""; };

type Meta = { kinds: string[]; methods: string[]; types: string[]; cleared: string[]; years: any[] };

const COLUMNS: { id: string; label: string; width?: number; money?: boolean }[] = [
  { id: "date", label: "Date", width: 92 },
  { id: "case", label: "Case", width: 200 },
  { id: "amount", label: "Amount", width: 104, money: true },
  { id: "kind", label: "Type of Payment", width: 168 },
  { id: "method", label: "Method", width: 124 },
  { id: "type", label: "Case Type", width: 116 },
  { id: "cleared", label: "Cleared", width: 82 },
  { id: "notes", label: "Notes" },
  { id: "profit", label: "Profit 30%", width: 100, money: true },
  { id: "owner", label: "Owner 15%", width: 100, money: true },
  { id: "tax", label: "Tax 25%", width: 100, money: true },
  { id: "operating", label: "Operating 25%", width: 112, money: true },
  { id: "modified", label: "Modified", width: 132 },
];
const DEFAULT_ORDER = COLUMNS.map((c) => c.id);
const SORTABLE = ["date", "case", "amount", "kind", "method", "type", "cleared", "notes", "modified"];
const LAYOUT_KEY = "efl.payments.columns";
const BLANK_ROW = { case_name: "", pay_date: "", amount: "", kind: "", method: "", case_type: "", cleared: "", notes: "" };

export default function Payments() {
  const [rows, setRows] = useState<any[]>([]);
  const [tot, setTot] = useState({ total: 0, sum_amount: 0, sum_profit: 0, sum_tax: 0 });
  const [meta, setMeta] = useState<Meta>({ kinds: [], methods: [], types: [], cleared: [], years: [] });
  const [cases, setCases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const [caseQ, setCaseQ] = useState("");
  const [kind, setKind] = useState<string[]>([]);
  const [method, setMethod] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [cleared, setCleared] = useState<string[]>([]);
  const [year, setYear] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("date");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragged = useRef(false);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ ...BLANK_ROW });
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [syncing, setSyncing] = useState(false);
  const choices = useChoices();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const kept = saved.filter((id: any) => DEFAULT_ORDER.indexOf(id) >= 0);
      const missing = DEFAULT_ORDER.filter((id) => kept.indexOf(id) < 0);
      if (kept.length) setOrder([...kept, ...missing]);
    } catch {}
  }, []);
  function persist(next: string[]) {
    setOrder(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
  }
  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    persist(next);
  }

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (caseQ) p.set("case", caseQ);
    kind.forEach((v) => p.append("kind", v));
    method.forEach((v) => p.append("method", v));
    type.forEach((v) => p.append("type", v));
    cleared.forEach((v) => p.append("cleared", v));
    year.forEach((v) => p.append("year", v));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (q) p.set("q", q);
    p.set("sort", sort); p.set("dir", dir);
    p.set("page", String(page)); p.set("pageSize", String(pageSize));
    return p.toString();
  }, [caseQ, kind, method, type, cleared, year, from, to, q, sort, dir, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/payments?" + qs);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
      setTot({ total: j.total || 0, sum_amount: j.sum_amount || 0, sum_profit: j.sum_profit || 0, sum_tax: j.sum_tax || 0 });
      setMsg(null);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setLoading(false);
  }, [qs]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/payments/meta").then((r) => r.json()).then((j) => { if (!j.error) setMeta(j); }).catch(() => {});
    fetch("/api/cases?limit=1000").then((r) => r.json()).then((j) => {
      const list = (j.rows || j.cases || j || []) as any[];
      setCases(list.map((c: any) => (typeof c === "string" ? c : c.name)).filter(Boolean));
    }).catch(() => {});
  }, []);

  function sortBy(col: string) {
    if (dragged.current || SORTABLE.indexOf(col) < 0) return;
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(col === "date" || col === "amount" || col === "modified" ? "desc" : "asc"); }
    setPage(1);
  }
  function clearFilters() {
    setCaseQ(""); setKind([]); setMethod([]); setType([]); setCleared([]);
    setYear([]); setFrom(""); setTo(""); setQ(""); setPage(1);
  }

  async function addPayment() {
    if (!form.pay_date || form.amount === "") { setMsg({ kind: "err", text: "A payment needs a date and an amount." }); return; }
    const r = await fetch("/api/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setForm({ ...BLANK_ROW }); setAdding(false);
    setMsg({ kind: "ok", text: "Payment added. It reaches Airtable at the next sync." });
    load();
  }
  async function saveEdit(id: number) {
    const r = await fetch("/api/payments/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setEditing(null); load();
  }
  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/sync/payments", { method: "POST" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Pulled ${j.pulled} from Airtable, sent ${j.pushed_new} new and ${j.pushed_upd} updates.` });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setSyncing(false);
  }

  const pages = Math.max(1, Math.ceil(tot.total / pageSize));
  const cols = order.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean);

  function cell(id: string, p: any) {
    switch (id) {
      case "date": return <td key={id} className="date">{p.pay_date || ""}</td>;
      case "case": return <td key={id}>{p.case_name || <span className="muted">-</span>}</td>;
      case "amount": return <td key={id} className="money"><b>{money(p.amount)}</b></td>;
      case "kind": return <td key={id} className="small"><Chip v={p.kind} colors={choices[CF.payKind]} /></td>;
      case "method": return <td key={id} className="small"><Chip v={p.method} colors={choices[CF.payMethod]} /></td>;
      case "type": return <td key={id} className="small"><Chip v={p.case_type} colors={choices[CF.payType]} /></td>;
      case "cleared": return <td key={id} className="small"><Chip v={p.cleared} colors={choices[CF.payCleared]} /></td>;
      case "notes": return <td key={id} className="small">{p.notes}</td>;
      case "profit": return <td key={id} className="money muted">{money(p.profit)}</td>;
      case "owner": return <td key={id} className="money muted">{money(p.owner_pay)}</td>;
      case "tax": return <td key={id} className="money muted">{money(p.tax)}</td>;
      case "operating": return <td key={id} className="money muted">{money(p.operating)}</td>;
      case "modified": return <td key={id} className="date nowrap" title={stamp(p.at_modified || p.updated_at)}>{when(p.at_modified || p.updated_at)}</td>;
      default: return <td key={id} />;
    }
  }

  const pick = (v: string[], set: (s: string[]) => void, label: string, opts: any[], allLabel: string) => (
    <MultiSelect label={label} allLabel={allLabel} options={opts}
      value={v} onChange={(next) => { set(next); setPage(1); }} />
  );

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="pay">
        <div className="row">
          <h2 style={{ margin: 0 }}>Add a payment</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setAdding(!adding)}>{adding ? "Close" : "New payment"}</button>
        </div>
        {adding ? (
          <>
            <div className="grid g4" style={{ marginTop: 9 }}>
              <div><label className="f">Payment date</label><input type="date" value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} /></div>
              <div><label className="f">Amount</label><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
              <div><label className="f">Case</label>
                <input type="text" list="paycases" value={form.case_name} onChange={(e) => setForm({ ...form, case_name: e.target.value })} placeholder="Start typing" />
                <datalist id="paycases">{cases.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div><label className="f">Cleared?</label>
                <select value={form.cleared} onChange={(e) => setForm({ ...form, cleared: e.target.value })}>
                  <option value="">-</option>
                  {meta.cleared.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid g4" style={{ marginTop: 7 }}>
              <div><label className="f">Type of payment</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="">-</option>
                  {meta.kinds.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="f">Payment method</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="">-</option>
                  {meta.methods.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="f">Case type</label>
                <select value={form.case_type} onChange={(e) => setForm({ ...form, case_type: e.target.value })}>
                  <option value="">-</option>
                  {meta.types.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="f">Notes</label><input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="row" style={{ marginTop: 9 }}>
              <button className="btn primary sm" onClick={addPayment}>Save payment</button>
              <div className="spacer" />
              <span className="muted small">Airtable works out the profit, owner&apos;s pay, tax and operating splits.</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="card noprint" data-tone="pay">
        <h2>Filters</h2>
        <div className="grid g4">
          <div><label className="f">Case contains</label><input type="search" value={caseQ} onChange={(e) => { setCaseQ(e.target.value); setPage(1); }} placeholder="e.g. Bunting" /></div>
          {pick(kind, setKind, "Type of payment", meta.kinds, "All types")}
          {pick(method, setMethod, "Payment method", meta.methods, "All methods")}
          {pick(type, setType, "Case type", meta.types, "All case types")}
        </div>
        <div className="grid g4" style={{ marginTop: 7 }}>
          {pick(cleared, setCleared, "Cleared?", meta.cleared, "Any")}
          {pick(year, setYear, "Year", meta.years, "All years")}
          <div><label className="f">From</label><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></div>
          <div><label className="f">To</label><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
        </div>
        <div className="row" style={{ marginTop: 7 }}>
          <div style={{ flex: 1 }}><label className="f">Notes contain</label><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <button className="btn sm" onClick={clearFilters}>Clear filters</button>
        </div>
      </div>

      <div className="card" data-tone="pay">
        <h2>Payments</h2>
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats">
            <div className="stat"><b>{money(tot.sum_amount)}</b><span>Total</span></div>
            <div className="stat"><b>{tot.total.toLocaleString()}</b><span>Payments</span></div>
            <div className="stat"><b>{money(tot.sum_profit)}</b><span>Profit 30%</span></div>
            <div className="stat"><b>{money(tot.sum_tax)}</b><span>Tax 25%</span></div>
          </div>
          <div className="spacer" />
          <div className="row noprint">
            <span className="muted small">Click a heading to sort. Drag to move.</span>
            <button className="btn sm" onClick={() => persist(DEFAULT_ORDER)}>Reset columns</button>
            <button className="btn sm" onClick={() => window.print()}>Print / PDF</button>
            <button className="btn sm" disabled={syncing} onClick={syncNow}>{syncing ? "Syncing..." : "Sync Airtable"}</button>
          </div>
        </div>

        <div className="tablewrap">
          <table className="data">
            <thead><tr>
              {cols.map((c) => (
                <th key={c.id} style={c.width ? { width: c.width } : undefined}
                    className={(SORTABLE.indexOf(c.id) >= 0 ? "sortable" : "") + (c.money ? " money" : "") + (overId === c.id ? " over" : "") + (dragId === c.id ? " dragging" : "")}
                    draggable
                    onDragStart={() => { dragged.current = true; setDragId(c.id); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); setTimeout(() => { dragged.current = false; }, 60); }}
                    onDragOver={(e) => { e.preventDefault(); setOverId(c.id); }}
                    onDragLeave={() => setOverId((v) => (v === c.id ? null : v))}
                    onDrop={(e) => { e.preventDefault(); drop(c.id); setOverId(null); }}
                    onClick={() => sortBy(c.id)}>
                  <span className="grip">⠿</span>{c.label}
                  <span className="caret">{sort === c.id ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                </th>
              ))}
              <th className="noprint" style={{ width: 62 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={cols.length + 1} className="muted">Loading...</td></tr>)
                : rows.length === 0 ? (<tr><td colSpan={cols.length + 1} className="muted">No payments match these filters.</td></tr>)
                : rows.map((p) => editing === p.id ? (
                <tr key={p.id}><td colSpan={cols.length + 1}>
                  <div className="grid g4">
                    <div><label className="f">Payment date</label><input type="date" value={draft.pay_date || ""} onChange={(e) => setDraft({ ...draft, pay_date: e.target.value })} /></div>
                    <div><label className="f">Amount</label><input type="number" step="0.01" value={draft.amount ?? ""} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></div>
                    <div><label className="f">Case</label>
                      <input type="text" list="paycases" value={draft.case_name || ""} onChange={(e) => setDraft({ ...draft, case_name: e.target.value })} />
                    </div>
                    <div><label className="f">Cleared?</label>
                      <select value={draft.cleared || ""} onChange={(e) => setDraft({ ...draft, cleared: e.target.value })}>
                        <option value="">-</option>
                        {meta.cleared.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid g4" style={{ marginTop: 7 }}>
                    <div><label className="f">Type of payment</label>
                      <select value={draft.kind || ""} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                        <option value="">-</option>
                        {meta.kinds.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Payment method</label>
                      <select value={draft.method || ""} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
                        <option value="">-</option>
                        {meta.methods.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Case type</label>
                      <select value={draft.case_type || ""} onChange={(e) => setDraft({ ...draft, case_type: e.target.value })}>
                        <option value="">-</option>
                        {meta.types.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div><label className="f">Notes</label><input type="text" value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
                  </div>
                  <div className="row" style={{ marginTop: 9 }}>
                    <button className="btn primary sm" onClick={() => saveEdit(p.id)}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                    <div className="spacer" />
                    <span className="muted small">Changes reach Airtable at the next sync.</span>
                  </div>
                </td></tr>
              ) : (
                <tr key={p.id}>
                  {cols.map((c) => cell(c.id, p))}
                  <td className="noprint">
                    <button className="btn ghost sm" onClick={() => {
                      setEditing(p.id);
                      setDraft({ pay_date: p.pay_date || "", amount: p.amount ?? "", case_name: p.case_name || "", cleared: p.cleared || "", kind: p.kind || "", method: p.method || "", case_type: p.case_type || "", notes: p.notes || "" });
                    }}>Edit</button>
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
