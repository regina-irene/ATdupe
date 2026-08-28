"use client";
import { useEffect, useRef, useState } from "react";

const ACCENTS = [
  { id: "navy", c: "#1f3a5f" }, { id: "teal", c: "#0f766e" }, { id: "forest", c: "#15803d" },
  { id: "plum", c: "#6d28d9" }, { id: "burgundy", c: "#9f1239" }, { id: "copper", c: "#b45309" },
  { id: "slate", c: "#334155" }, { id: "ink", c: "#0f172a" },
];

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState("navy");
  const [mode, setMode] = useState("light");
  const [density, setDensity] = useState("cozy");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setAccent(localStorage.getItem("efl_accent") || "navy");
      setMode(localStorage.getItem("efl_mode") || "light");
      setDensity(localStorage.getItem("efl_density") || "cozy");
    } catch {}
  }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const set = (k: string, v: string, attr: string) => {
    try { localStorage.setItem(k, v); } catch {}
    document.documentElement.setAttribute(attr, v);
  };

  return (
    <div className="tm" ref={box}>
      <button className="iconbtn" title="Appearance" onClick={() => setOpen(!open)}>&#9673;</button>
      {open ? (
        <div className="tmpanel">
          <h4>Appearance</h4>
          <div className="seg">
            {["light", "dark", "auto"].map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => {
                setMode(m);
                const eff = m === "auto" ? (window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light") : m;
                try { localStorage.setItem("efl_mode", m); } catch {}
                document.documentElement.setAttribute("data-mode", eff);
              }}>{m[0].toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
          <h4>Density</h4>
          <div className="seg">
            {["compact", "cozy", "roomy"].map((d) => (
              <button key={d} className={density === d ? "on" : ""} onClick={() => { setDensity(d); set("efl_density", d, "data-density"); }}>{d[0].toUpperCase() + d.slice(1)}</button>
            ))}
          </div>
          <h4>Accent colour</h4>
          <div className="swatches">
            {ACCENTS.map((a) => (
              <div key={a.id} title={a.id} className={"sw " + (accent === a.id ? "on" : "")} style={{ background: a.c }} onClick={() => { setAccent(a.id); set("efl_accent", a.id, "data-accent"); }} />
            ))}
          </div>
          <p className="muted small" style={{ margin: "10px 0 0" }}>Saved on this device, just for you.</p>
        </div>
      ) : null}
    </div>
  );
}
