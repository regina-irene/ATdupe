"use client";
import { useEffect, useState } from "react";

const LOOKS = [
  { id: "firm", name: "Firm", blurb: "The current look, tidied. Navy chrome, soft cards, comfortable spacing.", sw: ["#1f3a5f", "#f4f6f9", "#ffffff"] },
  { id: "paper", name: "Paper", blurb: "Warm cream with serif headings. Reads like a printed file.", sw: ["#8a6d3b", "#f6f2ea", "#fffdf7"] },
  { id: "crisp", name: "Crisp", blurb: "Flat and quiet. Square corners, hairline rules, no shadows.", sw: ["#334155", "#fbfbfc", "#ffffff"] },
  { id: "bold", name: "Bold", blurb: "Higher contrast, heavier headings, larger type. Easiest to scan.", sw: ["#0a0f16", "#f2f5f9", "#ffffff"] },
  { id: "night", name: "Night", blurb: "Dark throughout, whatever the light setting says.", sw: ["#60a5fa", "#070b11", "#111823"] },
];

const ACCENTS = [
  { id: "navy", c: "#1f3a5f" }, { id: "teal", c: "#0f766e" }, { id: "forest", c: "#15803d" },
  { id: "plum", c: "#6d28d9" }, { id: "burgundy", c: "#9f1239" }, { id: "copper", c: "#b45309" },
  { id: "slate", c: "#334155" }, { id: "ink", c: "#0f172a" },
];

const PAGES = [
  { id: "board", label: "Time", d: "#2563eb" }, { id: "reports", label: "Reports", d: "#0891b2" },
  { id: "import", label: "Data", d: "#b45309" }, { id: "tasks", label: "Tasks", d: "#7c3aed" },
  { id: "payments", label: "Payments", d: "#047857" }, { id: "cases", label: "Case Status", d: "#c2410c" },
  { id: "clients", label: "Clients", d: "#a21caf" }, { id: "boards", label: "Client Boards", d: "#4f46e5" },
  { id: "setup", label: "Setup", d: "#0f766e" },
];

const get = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const put = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

export default function Settings() {
  const [look, setLook] = useState("firm");
  const [mode, setMode] = useState("light");
  const [density, setDensity] = useState("cozy");
  const [accent, setAccent] = useState("navy");
  const [hex, setHex] = useState("");
  const [hues, setHues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setLook(get("efl_look", "firm"));
    setMode(get("efl_mode", "light"));
    setDensity(get("efl_density", "cozy"));
    setAccent(get("efl_accent", "navy"));
    setHex(get("efl_accent_hex", ""));
    try { setHues(JSON.parse(get("efl_hues", "{}"))); } catch {}
  }, []);

  const flash = (t: string) => { setSaved(t); setTimeout(() => setSaved(""), 1600); };
  const root = () => document.documentElement;

  function pickLook(v: string) { setLook(v); put("efl_look", v); root().setAttribute("data-look", v); flash("Look set to " + v + "."); }
  function pickMode(v: string) {
    setMode(v); put("efl_mode", v);
    const eff = v === "auto" ? (window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light") : v;
    root().setAttribute("data-mode", eff);
  }
  function pickDensity(v: string) { setDensity(v); put("efl_density", v); root().setAttribute("data-density", v); }
  function pickAccent(v: string) {
    setAccent(v); put("efl_accent", v); put("efl_accent_hex", null); setHex("");
    root().setAttribute("data-accent", v);
    root().style.removeProperty("--accent"); root().style.removeProperty("--accent-2");
  }
  function pickHex(v: string) {
    setHex(v); put("efl_accent_hex", v);
    root().style.setProperty("--accent", v); root().style.setProperty("--accent-2", v);
  }
  function pickHue(page: string, v: string) {
    const next = { ...hues, [page]: v };
    setHues(next); put("efl_hues", JSON.stringify(next));
    if (root().getAttribute("data-page") === page) root().style.setProperty("--page", v);
  }
  function clearHue(page: string) {
    const next = { ...hues }; delete next[page];
    setHues(next); put("efl_hues", JSON.stringify(next));
    if (root().getAttribute("data-page") === page) root().style.removeProperty("--page");
  }
  function resetAll() {
    if (!confirm("Put every appearance setting back to how it started?")) return;
    ["efl_look", "efl_mode", "efl_density", "efl_accent", "efl_accent_hex", "efl_hues"].forEach((k) => put(k, null));
    location.reload();
  }

  return (
    <div className="wrap">
      {saved ? <div className="notice ok">{saved}</div> : null}

      <div className="card" data-tone="status">
        <h2>Look</h2>
        <p className="muted small" style={{ marginTop: 0 }}>Five whole treatments. Each changes the spacing, corners, type and shadows, not just the colour.</p>
        <div className="lookgrid">
          {LOOKS.map((l) => (
            <button key={l.id} className={"lookcard " + (look === l.id ? "on" : "")} onClick={() => pickLook(l.id)}>
              <span className="lookswatch">
                {l.sw.map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
              <b>{l.name}</b>
              <span className="muted small">{l.blurb}</span>
              {look === l.id ? <span className="lookon">In use</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="card" data-tone="status">
        <h2>Basics</h2>
        <div className="grid g3">
          <div><label className="f">Light or dark</label>
            <div className="seg">
              {["light", "dark", "auto"].map((m) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => pickMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
              ))}
            </div>
          </div>
          <div><label className="f">Spacing</label>
            <div className="seg">
              {["compact", "cozy", "roomy"].map((d) => (
                <button key={d} className={density === d ? "on" : ""} onClick={() => pickDensity(d)}>{d[0].toUpperCase() + d.slice(1)}</button>
              ))}
            </div>
          </div>
          <div><label className="f">Your own accent</label>
            <div className="row">
              <input type="color" value={hex || "#1f3a5f"} onChange={(e) => pickHex(e.target.value)} style={{ width: 52, padding: 2, height: 32 }} />
              <input type="text" value={hex} onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) pickHex(e.target.value); else setHex(e.target.value); }} placeholder="#1f3a5f" />
            </div>
          </div>
        </div>
        <label className="f" style={{ marginTop: 11 }}>Accent colour</label>
        <div className="swatches">
          {ACCENTS.map((a) => (
            <div key={a.id} title={a.id} className={"sw " + (accent === a.id && !hex ? "on" : "")}
              style={{ background: a.c }} onClick={() => pickAccent(a.id)} />
          ))}
        </div>
      </div>

      <div className="card" data-tone="status">
        <h2>Tab colours</h2>
        <p className="muted small" style={{ marginTop: 0 }}>The stripe under the top bar, the headings and the stat markers on each tab.</p>
        <div className="huegrid">
          {PAGES.map((p) => (
            <div key={p.id} className="huerow">
              <input type="color" value={hues[p.id] || p.d} onChange={(e) => pickHue(p.id, e.target.value)} />
              <span>{p.label}</span>
              {hues[p.id] ? <button className="btn ghost sm" onClick={() => clearHue(p.id)}>Reset</button> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card" data-tone="danger">
        <h2>Start over</h2>
        <div className="row">
          <button className="btn sm" onClick={resetAll}>Reset every appearance setting</button>
          <div className="spacer" />
          <span className="muted small">Saved in this browser, for you only. Krista and Kayla keep their own.</span>
        </div>
      </div>
    </div>
  );
}
