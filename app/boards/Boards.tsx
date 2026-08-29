"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Board = {
  id: number; base_id: string; label: string; case_name: string | null; note: string | null;
  last_sync: string | null; last_result: string | null; rows: number; added_at: string;
};
type Tbl = { id: string; name: string; rows: number };

const when = (v: any) => {
  if (!v) return "";
  const t = new Date(v);
  if (isNaN(t.getTime())) return "";
  const m = String(t.getMinutes()).padStart(2, "0");
  return `${t.getMonth() + 1}/${t.getDate()}/${String(t.getFullYear()).slice(2)} ${t.getHours() % 12 || 12}:${m} ${t.getHours() >= 12 ? "PM" : "AM"}`;
};

const COLUMNS: { id: string; label: string; width?: number }[] = [
  { id: "label", label: "Board" },
  { id: "case_name", label: "Case", width: 220 },
  { id: "rows", label: "Rows", width: 90 },
  { id: "last_sync", label: "Last sync", width: 150 },
  { id: "last_result", label: "Result", width: 190 },
  { id: "note", label: "Note", width: 190 },
  { id: "base_id", label: "Base id", width: 160 },
  { id: "added_at", label: "Added", width: 150 },
];
const DEFAULT_COLS = ["label", "case_name", "rows", "last_sync"];
const LAYOUT = "efl.boards.columns";

const GROUPS: { id: string; label: string }[] = [
  { id: "", label: "No grouping" },
  { id: "case", label: "Group by case" },
  { id: "letter", label: "Group by first letter" },
  { id: "state", label: "Group by sync state" },
];

export default function Boards() {
  const [rows, setRows] = useState<Board[]>([]);
  const [cases, setCases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ url: "", label: "", case_name: "" });
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState("label");
  const [dir, setDir] = useState("asc");

  const [shown, setShown] = useState<string[]>(DEFAULT_COLS);
  const [picker, setPicker] = useState(false);
  const pickerBox = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragged = useRef(false);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [tables, setTables] = useState<Record<string, Tbl[]>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) setShown(saved.filter((c: any) => COLUMNS.some((x) => x.id === c)));
      }
    } catch {}
  }, []);
  function persist(next: string[]) {
    setShown(next);
    try { localStorage.setItem(LAYOUT, JSON.stringify(next)); } catch {}
  }
  useEffect(() => {
    if (!picker) return;
    const away = (e: MouseEvent) => { if (pickerBox.current && !pickerBox.current.contains(e.target as Node)) setPicker(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [picker]);

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

  async function importFromClients() {
    setBusy("import");
    try {
      const j = await (await fetch("/api/client-boards/import", { method: "POST" })).json();
      if (j.error) throw new Error(j.error);
      const bits = [`Read ${j.seen} clients`, `${j.added} added`, `${j.updated} renamed`];
      if (j.no_base) bits.push(`${j.no_base} without a base id`);
      setMsg({ kind: "ok", text: bits.join(", ") + "." });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy("");
  }

  async function add() {
    if (!form.url.trim()) { setMsg({ kind: "err", text: "Paste one or more Airtable links." }); return; }
    setBusy("add");
    try {
      const j = await (await fetch("/api/client-boards", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      })).json();
      if (j.error) throw new Error(j.error);
      const bits = [`Added ${j.added.length}`];
      if (j.skipped?.length) bits.push(`${j.skipped.length} already on the list`);
      if (j.failed?.length) bits.push(`${j.failed.length} the token cannot read`);
      setMsg({ kind: j.failed?.length ? "warn" : "ok", text: bits.join(", ") + "." });
      setForm({ url: "", label: "", case_name: "" });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy("");
  }

  async function loadTables(b: Board) {
    if (tables[b.base_id]) return;
    try {
      const j = await (await fetch("/api/client-boards/" + b.base_id)).json();
      if (j.error) throw new Error(j.error);
      setTables((t) => ({ ...t, [b.base_id]: j.tables || [] }));
    } catch (e: any) { setMsg({ kind: "err", text: b.label + ": " + e.message }); }
  }
  function toggle(b: Board) {
    const next = !open[b.base_id];
    setOpen({ ...open, [b.base_id]: next });
    if (next) loadTables(b);
  }

  async function syncBoard(b: Board) {
    setBusy(b.base_id);
    try {
      const j = await (await fetch("/api/client-boards/" + b.base_id)).json();
      if (j.error) throw new Error(j.error);
      let pulled = 0;
      for (const t of j.tables || []) {
        const r = await (await fetch("/api/sync/mirror/b:" + b.base_id + ":" + t.id, { method: "POST" })).json();
        if (!r.error) pulled += r.pulled || 0;
      }
      setMsg({ kind: "ok", text: `${b.label}: ${pulled.toLocaleString()} rows across ${(j.tables || []).length} tables.` });
      setTables((t) => { const n = { ...t }; delete n[b.base_id]; return n; });
      load();
    } catch (e: any) { setMsg({ kind: "err", text: b.label + ": " + e.message }); }
    setBusy("");
  }

  async function syncAll() {
    setBusy("all");
    let done = 0;
    for (const b of rows) {
      try {
        const j = await (await fetch("/api/client-boards/" + b.base_id)).json();
        for (const t of j.tables || []) {
          await fetch("/api/sync/mirror/b:" + b.base_id + ":" + t.id, { method: "POST" });
        }
        done++;
        setMsg({ kind: "ok", text: `Synced ${done} of ${rows.length} boards...` });
      } catch {}
    }
    setMsg({ kind: "ok", text: `Synced ${done} of ${rows.length} boards.` });
    setTables({}); setBusy(""); load();
  }

  async function rename(b: Board) {
    const j = await (await fetch("/api/client-boards/" + b.base_id, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ renameFromAirtable: true }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setMsg({ kind: "ok", text: j.label ? `Renamed to "${j.label}".` : "Airtable did not give a name for that base." });
    load();
  }

  async function remove(b: Board) {
    if (!confirm(`Remove "${b.label}" and delete its ${b.rows.toLocaleString()} mirrored rows? Airtable is not touched.`)) return;
    const j = await (await fetch("/api/client-boards/" + b.base_id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  const cols = shown.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? rows.filter((b) =>
      [b.label, b.case_name, b.note, b.base_id].some((v) => String(v || "").toLowerCase().indexOf(t) >= 0)) : rows;
    const val = (b: Board) => String((b as any)[sort] ?? "").toLowerCase();
    return [...list].sort((a, b) => {
      if (sort === "rows") return (dir === "asc" ? 1 : -1) * (a.rows - b.rows);
      return (dir === "asc" ? 1 : -1) * val(a).localeCompare(val(b));
    });
  }, [rows, q, sort, dir]);

  const grouped = useMemo(() => {
    if (!group) return [{ key: "", items: filtered }];
    const map = new Map<string, Board[]>();
    for (const b of filtered) {
      const k = group === "case" ? (b.case_name || "Not linked to a case")
        : group === "letter" ? (b.label?.[0] || "?").toUpperCase()
        : b.last_sync ? "Synced" : "Never synced";
      map.set(k, [...(map.get(k) || []), b]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => ({ key, items }));
  }, [filtered, group]);

  function sortBy(id: string) {
    if (dragged.current) return;
    if (sort === id) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(id); setDir("asc"); }
  }
  function drop(target: string) {
    if (!dragId || dragId === target) return;
    const next = shown.filter((c) => c !== dragId);
    next.splice(next.indexOf(target), 0, dragId);
    persist(next);
  }

  function cell(id: string, b: Board) {
    switch (id) {
      case "label": return <td key={id}>
        <button className="twist" title={open[b.base_id] ? "Collapse" : "Show tables"} onClick={() => toggle(b)}>{open[b.base_id] ? "▾" : "▸"}</button>
        <a href={"/boards/" + b.base_id}><b>{b.label}</b></a>
      </td>;
      case "case_name": return <td key={id}>{b.case_name
        ? <a href={"/cases?q=" + encodeURIComponent(b.case_name)}>{b.case_name}</a>
        : <span className="muted">not linked</span>}</td>;
      case "rows": return <td key={id} className="money">{b.rows.toLocaleString()}</td>;
      case "last_sync": return <td key={id} className="date small">{b.last_sync ? when(b.last_sync) : <span className="muted">never</span>}</td>;
      case "last_result": return <td key={id} className="small muted">{b.last_result || ""}</td>;
      case "note": return <td key={id} className="small muted">{b.note || ""}</td>;
      case "base_id": return <td key={id} className="small muted">{b.base_id}</td>;
      case "added_at": return <td key={id} className="date small">{when(b.added_at)}</td>;
      default: return <td key={id} />;
    }
  }

  const span = cols.length + 1;

  return (
    <div className="wrap">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="board">
        <h2>Add client boards</h2>
        <div className="grid g4">
          <div style={{ gridColumn: "span 2" }}><label className="f">Airtable links</label>
            <textarea value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="Paste one link, or many at once, one per line" style={{ minHeight: 60 }} /></div>
          <div><label className="f">Name (single board only)</label>
            <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Blank uses the Airtable base name" /></div>
          <div><label className="f">Case (single board only)</label>
            <input type="text" list="allcases" value={form.case_name} onChange={(e) => setForm({ ...form, case_name: e.target.value })}
              placeholder="Start typing" />
            <datalist id="allcases">{cases.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="row" style={{ marginTop: 9 }}>
          <button className="btn primary sm" disabled={!!busy} onClick={add}>{busy === "add" ? "Checking access..." : "Add"}</button>
          <button className="btn sm" disabled={!!busy} onClick={importFromClients}>
            {busy === "import" ? "Reading Clients..." : "Import from Clients tab"}
          </button>
          <div className="spacer" />
          <span className="muted small">Import names every board from the Clients table and links it to its case.</span>
        </div>
      </div>

      <div className="card" data-tone="board">
        <div className="row" style={{ marginBottom: 9 }}>
          <div className="stats"><div className="stat"><b>{rows.length}</b><span>Boards</span></div>
            <div className="stat"><b>{rows.reduce((n, b) => n + b.rows, 0).toLocaleString()}</b><span>Rows</span></div></div>
          <div className="spacer" />
          <div className="row noprint">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a board" style={{ width: 150 }} />
            <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 165 }}>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <div className="ms" ref={pickerBox}>
              <button className="btn sm" onClick={() => setPicker(!picker)}>Columns ({cols.length})</button>
              {picker ? (
                <div className="mspanel" style={{ right: 0, left: "auto" }}>
                  <div className="msrow">
                    <button className="btn ghost sm" onClick={() => persist(COLUMNS.map((c) => c.id))}>Show all</button>
                    <button className="btn ghost sm" onClick={() => persist(DEFAULT_COLS)}>Reset</button>
                    <div className="spacer" />
                    <button className="btn ghost sm" onClick={() => setPicker(false)}>Done</button>
                  </div>
                  <div className="mslist">
                    {COLUMNS.map((c) => (
                      <label key={c.id} className="msitem">
                        <input type="checkbox" checked={shown.indexOf(c.id) >= 0}
                          onChange={() => persist(shown.indexOf(c.id) >= 0 ? shown.filter((x) => x !== c.id) : [...shown, c.id])} />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button className="btn sm" disabled={!!busy} onClick={syncAll}>{busy === "all" ? "Syncing all..." : "Sync all boards"}</button>
          </div>
        </div>

        <div className="tablewrap">
          <table className="data">
            <thead><tr>
              {cols.map((c) => (
                <th key={c.id} style={c.width ? { width: c.width } : undefined} className="sortable" draggable
                    onDragStart={() => { dragged.current = true; setDragId(c.id); }}
                    onDragEnd={() => { setDragId(null); setTimeout(() => { dragged.current = false; }, 60); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); drop(c.id); }}
                    onClick={() => sortBy(c.id)}>
                  <span className="grip">⠿</span>{c.label}
                  <span className="caret">{sort === c.id ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                </th>
              ))}
              <th className="noprint" style={{ width: 190 }}></th>
            </tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={span} className="muted">Loading...</td></tr>)
                : filtered.length === 0 ? (<tr><td colSpan={span} className="muted">No client boards yet. Paste some links above.</td></tr>)
                : grouped.map((g) => (
                <Fragment key={"grp" + g.key}>
                  {g.key ? (
                    <tr key={"g" + g.key} className="grouprow">
                      <td colSpan={span} onClick={() => setCollapsed({ ...collapsed, [g.key]: !collapsed[g.key] })}>
                        <button className="twist">{collapsed[g.key] ? "▸" : "▾"}</button>
                        <b>{g.key}</b> <span className="muted small">({g.items.length})</span>
                      </td>
                    </tr>
                  ) : null}
                  {collapsed[g.key] ? null : g.items.map((b) => (
                    <Fragment key={b.base_id}>
                      <tr key={b.base_id}>
                        {cols.map((c) => cell(c.id, b))}
                        <td className="noprint">
                          <a className="btn ghost sm" href={"/boards/" + b.base_id}>Open</a>
                          <button className="btn ghost sm" disabled={!!busy} onClick={() => syncBoard(b)}>{busy === b.base_id ? "..." : "Sync"}</button>
                          <button className="btn ghost sm" title="Take the name from Airtable" onClick={() => rename(b)}>Rename</button>
                          <button className="btn ghost sm" onClick={() => remove(b)}>Remove</button>
                        </td>
                      </tr>
                      {open[b.base_id] ? (
                        <tr key={b.base_id + "x"} className="expandrow">
                          <td colSpan={span}>
                            {!tables[b.base_id] ? <span className="muted small">Loading tables...</span> : (
                              <div className="chips" style={{ marginTop: 0 }}>
                                {tables[b.base_id].map((t) => (
                                  <a key={t.id} className="chip" href={"/boards/" + b.base_id + "?t=" + t.id}>
                                    {t.name}{t.rows ? " · " + t.rows.toLocaleString() : " · empty"}
                                  </a>
                                ))}
                                {tables[b.base_id].length === 0 ? <span className="muted small">No tables readable in this base.</span> : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
