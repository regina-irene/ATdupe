"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Row = {
  id: number; case_name: string; party: string; title: string | null;
  source_file: string | null; note: string | null; updated_at: string; size: number;
  share_token: string | null; active: boolean;
};
type Resp = {
  id: number; case_name: string; party: string; person_name: string | null;
  email: string | null; phone: string | null; submitted_text: string | null;
  responses: string | null; received_at: string; seen: boolean;
};

const when = (v: any) => {
  const t = new Date(v);
  return isNaN(t.getTime()) ? "" : t.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const partyClass = (p: string) => {
  const l = p.trim().toLowerCase();
  return l === "father" || l === "husband" ? "father" : l === "mother" || l === "wife" ? "mother" : "";
};

export default function Questionnaires() {
  const [rows, setRows] = useState<Row[]>([]);
  const [caseName, setCaseName] = useState<string>("");
  const [party, setParty] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [compare, setCompare] = useState(false);
  const [sideHtml, setSideHtml] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [resps, setResps] = useState<Resp[]>([]);
  const [tab, setTab] = useState<"answers" | "form">("answers");
  const [copied, setCopied] = useState("");

  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [j, k] = await Promise.all([
        (await fetch("/api/questionnaires")).json(),
        (await fetch("/api/questionnaires/responses")).json(),
      ]);
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
      setResps(k.rows || []);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cases = useMemo(() => {
    const t = q.trim().toLowerCase();
    const names = [...new Set([...rows.map((r) => r.case_name), ...resps.map((r) => r.case_name)])];
    return (t ? names.filter((n) => n.toLowerCase().indexOf(t) >= 0) : names).sort((a, b) => a.localeCompare(b));
  }, [rows, resps, q]);

  useEffect(() => { if (!caseName && cases.length) setCaseName(cases[0]); }, [cases, caseName]);

  const parties = useMemo(
    () => rows.filter((r) => r.case_name === caseName).sort((a, b) => a.party.localeCompare(b.party)),
    [rows, caseName]);

  useEffect(() => { if (parties.length && !parties.some((p) => p.party === party)) setParty(parties[0].party); },
    [parties, party]);

  const current = parties.find((p) => p.party === party);
  const caseResps = useMemo(
    () => resps.filter((r) => r.case_name.toLowerCase() === caseName.toLowerCase()),
    [resps, caseName]);
  const respParties = useMemo(
    () => [...new Set(caseResps.map((r) => r.party))].sort(), [caseResps]);
  const unreadFor = (name: string) =>
    resps.filter((r) => !r.seen && r.case_name.toLowerCase() === name.toLowerCase()).length;

  useEffect(() => {
    if (tab !== "answers") return;
    const ids = caseResps.filter((r) => !r.seen).map((r) => r.id);
    if (ids.length) markSeen(ids);
  }, [tab, caseResps]);
  const link = (t: string | null) =>
    t ? (typeof window === "undefined" ? "" : window.location.origin) + "/q/" + t : "";

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    }).catch(() => setMsg({ kind: "err", text: "Could not copy. Select the link and copy it by hand." }));
  }

  // Fetched only when actually shown; these documents can be large.
  const fetchDoc = useCallback(async (id: number) => {
    const j = await (await fetch("/api/questionnaires?id=" + id)).json();
    return j?.row?.html || "";
  }, []);

  useEffect(() => {
    if (!current || compare) return;
    setLoadingDoc(true);
    fetchDoc(current.id).then((h) => { setHtml(h); setLoadingDoc(false); });
  }, [current, compare, fetchDoc]);

  useEffect(() => {
    if (!compare) return;
    setLoadingDoc(true);
    Promise.all(parties.map(async (p) => [p.party, await fetchDoc(p.id)] as const))
      .then((pairs) => { setSideHtml(Object.fromEntries(pairs)); setLoadingDoc(false); });
  }, [compare, parties, fetchDoc]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.html?$/i.test(f.name));
    if (!list.length) { setMsg({ kind: "err", text: "Drop .html questionnaires." }); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("files", f);
      const j = await (await fetch("/api/questionnaires/upload", { method: "POST", body: fd })).json();
      if (j.error) throw new Error(j.error);
      setPending((j.results || []).filter((r: any) => r.html).map((r: any) => ({ ...r, keep: true })));
      const bad = (j.results || []).filter((r: any) => !r.html);
      setMsg(bad.length
        ? { kind: "warn", text: `${bad.length} file${bad.length > 1 ? "s" : ""} could not be read.` }
        : { kind: "ok", text: `Read ${list.length}. Check the case and parent, then save.` });
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  }

  async function savePending() {
    const keep = pending.filter((p) => p.keep && p.case_name && p.party);
    if (!keep.length) { setMsg({ kind: "err", text: "Each one needs a case and a parent." }); return; }
    setBusy(true);
    for (const p of keep) {
      const j = await (await fetch("/api/questionnaires", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ case_name: p.case_name, party: p.party, title: p.title, html: p.html, source_file: p.file }),
      })).json();
      if (j.error) { setMsg({ kind: "err", text: p.file + ": " + j.error }); setBusy(false); return; }
    }
    setPending([]);
    setMsg({ kind: "ok", text: `Saved ${keep.length}.` });
    setBusy(false);
    load();
  }

  // Opening a case's answers is what counts as having seen them.
  async function markSeen(ids: number[]) {
    if (!ids.length) return;
    await fetch("/api/questionnaires/responses", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }),
    }).catch(() => {});
    setResps((cur) => cur.map((r) => (ids.indexOf(r.id) >= 0 ? { ...r, seen: true } : r)));
  }

  async function dropResponse(r: Resp) {
    if (!confirm(`Delete ${r.party}'s submission for ${r.case_name}? This cannot be undone.`)) return;
    const j = await (await fetch("/api/questionnaires/responses/" + r.id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setMsg({ kind: "ok", text: "Submission deleted." });
    load();
  }

  async function clearCase() {
    if (!caseResps.length) return;
    if (!confirm(`Delete all ${caseResps.length} submission(s) for ${caseName}, and any part-finished answers? This cannot be undone.`)) return;
    const j = await (await fetch(
      "/api/questionnaires/responses?drafts=1&case=" + encodeURIComponent(caseName), { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setMsg({ kind: "ok", text: `Cleared ${j.removed} submission(s) for ${caseName}.` });
    load();
  }

  async function remove(r: Row) {
    if (!confirm(`Remove the ${r.party} questionnaire for ${r.case_name}?`)) return;
    const j = await (await fetch("/api/questionnaires/" + r.id, { method: "DELETE" })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    load();
  }

  function openInTab(h: string, name: string) {
    const blob = new Blob([h], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return (
    <div className="wrap wide">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card noprint" data-tone="qn">
        <div className="row">
          <h2 style={{ margin: 0 }}>Questionnaires</h2>
          <div className="spacer" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a case" style={{ width: 170 }} />
          <button className="btn primary sm" onClick={() => fileRef.current?.click()}>Upload</button>
        </div>

        <div className={"dropzone" + (over ? " over" : "")} style={{ padding: "16px 14px", marginTop: 9 }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".html,.htm" multiple hidden
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.currentTarget.value = ""; }} />
          <b>{busy ? "Working..." : "Drop questionnaires here, one per parent"}</b>
          <span className="muted small">
            HTML files. The case and parent are read from the file name, so
            <code>Buchanan - Father Questionnaire.html</code> needs nothing typed.
          </span>
        </div>

        {pending.length ? (
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="data mini">
              <thead><tr>
                <th style={{ width: 34 }}></th><th style={{ width: 190 }}>Case</th>
                <th style={{ width: 140 }}>Parent</th><th>Title</th><th style={{ width: 90 }}>Size</th>
              </tr></thead>
              <tbody>
                {pending.map((p, i) => {
                  const set = (patch: any) => setPending(pending.map((x, n) => (n === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={i}>
                      <td className="tick"><input type="checkbox" checked={p.keep} onChange={() => set({ keep: !p.keep })} /></td>
                      <td><input type="text" list="qncases" value={p.case_name || ""} onChange={(e) => set({ case_name: e.target.value })} />
                        <datalist id="qncases">{[...new Set(rows.map((r) => r.case_name))].map((n) => <option key={n} value={n} />)}</datalist>
                      </td>
                      <td><input type="text" list="qnparties" value={p.party || ""} onChange={(e) => set({ party: e.target.value })} />
                        <datalist id="qnparties"><option value="Father" /><option value="Mother" /></datalist>
                      </td>
                      <td className="small muted">{p.title || p.file}</td>
                      <td className="money small">{Math.round((p.size || 0) / 1024)} KB</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 7 }}>
              <button className="btn primary sm" disabled={busy} onClick={savePending}>Save the ticked ones</button>
              <button className="btn ghost sm" onClick={() => setPending([])}>Discard</button>
              <div className="spacer" />
              <span className="muted small">Saving over the same case and parent replaces that questionnaire.</span>
            </div>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="card" data-tone="qn"><p className="muted" style={{ margin: 0 }}>
          Nothing yet. Drop the first questionnaires above.
        </p></div>
      ) : (
        <div className="card" data-tone="qn">
          {/* a tab per case */}
          <div className="chips" style={{ marginTop: 0, marginBottom: 9 }}>
            {cases.map((n) => (
              <button key={n} className={"chip " + (caseName === n ? "on" : "")} onClick={() => { setCaseName(n); setCompare(false); }}>
                {n} <span className="muted">{rows.filter((r) => r.case_name === n).length}</span>
                {unreadFor(n) ? <span className="navbadge">{unreadFor(n)}</span> : null}
              </button>
            ))}
          </div>

          {/* the links to send the parents */}
          <div className="linkrow noprint">
            {parties.map((p) => (
              <div className="linkbox" key={p.id}>
                <div>
                  <b>{p.party === "Both" ? "Questionnaire link" : p.party + "'s link"}</b>
                  <div className="muted small">{p.title || p.source_file}</div>
                </div>
                <div className="spacer" />
                {p.share_token ? (
                  <>
                    <code className="linkcode" title={link(p.share_token)}>{link(p.share_token)}</code>
                    <button className="btn sm" onClick={() => copy(link(p.share_token), "link" + p.id)}>
                      {copied === "link" + p.id ? "Copied" : "Copy link"}
                    </button>
                    <a className="btn ghost sm" href={link(p.share_token)} target="_blank" rel="noreferrer">Open</a>
                  </>
                ) : <span className="muted small">Save it again to get a link.</span>}
                <button className="btn ghost sm" onClick={() => remove(p)}>Remove</button>
              </div>
            ))}
          </div>

          <div className="row" style={{ margin: "10px 0 9px" }}>
            <div className="seg">
              <button className={tab === "answers" ? "on" : ""} onClick={() => setTab("answers")}>
                Answers {caseResps.length ? "(" + caseResps.length + ")" : ""}
                {unreadFor(caseName) ? <span className="navbadge">{unreadFor(caseName)}</span> : null}
              </button>
              <button className={tab === "form" ? "on" : ""} onClick={() => setTab("form")}>The form</button>
            </div>
            {tab === "form" ? (
              <div className="chips" style={{ marginTop: 0 }}>
                {parties.map((p) => (
                  <button key={p.id} className={"chip pchip " + partyClass(p.party) + (party === p.party && !compare ? " on" : "")}
                    onClick={() => { setParty(p.party); setCompare(false); }}>{p.party}</button>
                ))}
                {parties.length > 1 ? (
                  <button className={"chip " + (compare ? "on" : "")} onClick={() => setCompare(!compare)}>Side by side</button>
                ) : null}
              </div>
            ) : null}
            <div className="spacer" />
            {tab === "answers" && caseResps.length ? (
              <button className="btn ghost sm noprint" onClick={clearCase}>Clear all answers</button>
            ) : null}
            {tab === "form" && current && !compare ? (
              <button className="btn sm noprint" onClick={() => openInTab(html, current.party)}>Open in a tab</button>
            ) : null}
          </div>

          {tab === "answers" ? (
            caseResps.length === 0 ? (
              <p className="muted small">
                Nothing submitted yet. Send the link above and answers will appear here as they come in.
              </p>
            ) : (
              <div className={respParties.length > 1 ? "qncompare" : ""}>
                {respParties.map((pt) => {
                  const latest = caseResps.filter((r) => r.party === pt)[0];
                  return (
                    <div className={"qnpane" + (latest.seen ? "" : " unseen")} data-party={partyClass(pt)} key={pt}>
                      <div className="partyhead">
                        {pt}{!latest.seen ? <span className="newflag">new</span> : null}
                        <span className="muted small" style={{ float: "right", textTransform: "none", letterSpacing: 0 }}>
                          {latest.submitted_text || when(latest.received_at)}
                        </span>
                      </div>
                      <div className="answers">
                        <div className="muted small" style={{ marginBottom: 7 }}>
                          {[latest.person_name, latest.email, latest.phone].filter(Boolean).join(" · ")}
                        </div>
                        <pre>{latest.responses}</pre>
                        <div className="row noprint" style={{ marginTop: 8 }}>
                          <a className="btn sm" href={"/api/questionnaires/export?format=doc&id=" + latest.id}>
                            Word
                          </a>
                          <a className="btn sm" href={"/api/questionnaires/export?format=print&id=" + latest.id}
                            target="_blank" rel="noreferrer">PDF</a>
                          <button className="btn ghost sm"
                            onClick={() => copy(latest.responses || "", "ans" + latest.id)}>
                            {copied === "ans" + latest.id ? "Copied" : "Copy answers"}
                          </button>
                          <button className="btn ghost sm" onClick={() => dropResponse(latest)}>Delete</button>
                          {caseResps.filter((r) => r.party === pt).length > 1 ? (
                            <span className="muted small">
                              {caseResps.filter((r) => r.party === pt).length} submissions, showing the most recent
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : loadingDoc ? <p className="muted small">Loading...</p> : compare ? (
            <div className="qncompare">
              {parties.map((p) => (
                <div key={p.id} className="qnpane" data-party={partyClass(p.party)}>
                  <div className="partyhead">{p.party}</div>
                  <iframe title={p.case_name + " " + p.party} sandbox="" srcDoc={sideHtml[p.party] || ""} />
                </div>
              ))}
            </div>
          ) : (
            <div className="qnpane single" data-party={partyClass(party)}>
              <iframe title={caseName + " " + party} sandbox="" srcDoc={html} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
