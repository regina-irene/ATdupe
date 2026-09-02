"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_SEASONS, seasonFor } from "../lib/seasons";
import { readParade, writeParade, onParadeChange, type ParadeSettings } from "../lib/parade";
import { celebrate } from "./celebrate";

export default function ParadeControls() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<ParadeSettings | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => setCfg(readParade()), []);
  useEffect(() => { refresh(); return onParadeChange(refresh); }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  if (!cfg) return null;
  const set = (p: Partial<ParadeSettings>) => { writeParade(p); refresh(); };
  const cast = (ALL_SEASONS.find((x) => x.id === cfg.season) || seasonFor()).cast;

  return (
    <div className="ms" ref={box}>
      <button className={"btn sm" + (cfg.on ? "" : " ghost")} title="The parade and the send-off"
        onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 14 }}>{cast[0]}</span> Parade
      </button>
      {open ? (
        <div className="mspanel" style={{ right: 0, left: "auto", width: 260 }}>
          <div className="msrow" style={{ borderBottom: "none", marginBottom: 2 }}>
            <b style={{ fontSize: 12 }}>Parade</b>
            <div className="spacer" />
            <div className="seg">
              <button className={cfg.on ? "on" : ""} onClick={() => set({ on: true })}>On</button>
              <button className={!cfg.on ? "on" : ""} onClick={() => set({ on: false })}>Off</button>
            </div>
          </div>

          <label className="f" style={{ marginTop: 8 }}>Size</label>
          <div className="seg">
            {[["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"]].map(([v, lab]) => (
              <button key={v} className={cfg.size === v ? "on" : ""} onClick={() => set({ size: v as any })}>{lab}</button>
            ))}
          </div>

          <label className="f" style={{ marginTop: 9 }}>Cast</label>
          <select value={cfg.season} onChange={(e) => set({ season: e.target.value })}>
            <option value="auto">Follow the month ({seasonFor().name})</option>
            {ALL_SEASONS.map((x) => <option key={x.id} value={x.id}>{x.name} {x.cast.slice(0, 3).join("")}</option>)}
          </select>

          <label className="f" style={{ marginTop: 9 }}>Celebrate a task done</label>
          <div className="seg">
            {[["all", "Every one"], ["priority", "00 and 01"], ["off", "Never"]].map(([v, lab]) => (
              <button key={v} className={cfg.celebrate === v ? "on" : ""} onClick={() => set({ celebrate: v as any })}>{lab}</button>
            ))}
          </div>

          <button className="btn sm" style={{ width: "100%", marginTop: 9 }}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              celebrate(r.left + r.width / 2, r.top, cast, true);
            }}>Try it</button>

          <p className="muted small" style={{ margin: "9px 0 0" }}>
            One walker per open RIE task, so the parade thins out as you clear the board.
            Clearing anything counts, so this is set to every one.
          </p>
          <div style={{ fontSize: 20, marginTop: 6, textAlign: "center" }}>{cast.join(" ")}</div>
        </div>
      ) : null}
    </div>
  );
}
