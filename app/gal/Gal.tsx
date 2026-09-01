"use client";
import { useCallback, useEffect, useState } from "react";

// Turns any Sheets link into one that frames cleanly, keeping the tab (gid).
function embedFrom(url: string, mode: "edit" | "view") {
  const id = (url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/) || [])[1];
  if (!id) return "";
  const gid = (url.match(/[?#&]gid=(\d+)/) || [])[1] || "0";
  return mode === "edit"
    ? `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}&rm=minimal&widget=true&chrome=false`
    : `https://docs.google.com/spreadsheets/d/${id}/preview?gid=${gid}`;
}

export default function Gal() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [height, setHeight] = useState("t");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/gal-sheet")).json();
      setUrl(j.url || "");
      setDraft(j.url || "");
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try {
      setMode((localStorage.getItem("efl_gal_mode") as any) || "edit");
      setHeight(localStorage.getItem("efl_gal_height") || "t");
    } catch {}
  }, []);
  const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

  async function save() {
    const j = await (await fetch("/api/gal-sheet", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: draft }),
    })).json();
    if (j.error) { setMsg({ kind: "err", text: j.error }); return; }
    setUrl(j.url); setEditing(false); setNonce((n) => n + 1);
    setMsg({ kind: "ok", text: "Sheet updated for everyone." });
  }

  const src = url ? embedFrom(url, mode) : "";

  return (
    <div className="wrap wide">
      {msg ? <div className={"notice " + msg.kind}>{msg.text}</div> : null}

      <div className="card" data-tone="gal">
        <div className="row" style={{ marginBottom: 9 }}>
          <h2 style={{ margin: 0 }}>GAL Status</h2>
          <div className="spacer" />
          <div className="row noprint">
            <div className="seg rowsize">
              {[["edit", "Edit"], ["view", "Read only"]].map(([id, lab]) => (
                <button key={id} className={mode === id ? "on" : ""}
                  onClick={() => { setMode(id as any); remember("efl_gal_mode", id); }}>{lab}</button>
              ))}
            </div>
            <div className="seg rowsize">
              {[["n", "Normal"], ["t", "Tall"], ["f", "Full"]].map(([id, lab]) => (
                <button key={id} className={height === id ? "on" : ""}
                  onClick={() => { setHeight(id); remember("efl_gal_height", id); }}>{lab}</button>
              ))}
            </div>
            <button className="btn sm" onClick={() => setNonce((n) => n + 1)}>Reload</button>
            <a className="btn sm" href={url} target="_blank" rel="noreferrer">Open in Sheets</a>
            <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? "Close" : "Change sheet"}</button>
          </div>
        </div>

        {editing ? (
          <div className="row" style={{ marginBottom: 9 }}>
            <div style={{ flex: 1 }}><label className="f">Google Sheets link</label>
              <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..." /></div>
            <button className="btn primary sm" onClick={save}>Save</button>
            <button className="btn ghost sm" onClick={() => { setDraft(url); setEditing(false); }}>Cancel</button>
          </div>
        ) : null}

        {src ? (
          <div className={"sheetwrap h-" + height}>
            <iframe key={nonce} src={src} title="GAL Status" loading="lazy"
              allow="clipboard-read; clipboard-write" />
          </div>
        ) : <p className="muted small">No sheet set. Use Change sheet to point at one.</p>}

        <p className="muted small noprint" style={{ marginTop: 8, marginBottom: 0 }}>
          The sheet loads with your own Google account, so you see and edit exactly what Google lets you.
          If it comes up blank, you are probably signed into a different Google account in this browser, or the
          sheet has not been shared with you. <a href={url} target="_blank" rel="noreferrer">Open it directly</a> to check.
        </p>
      </div>
    </div>
  );
}
