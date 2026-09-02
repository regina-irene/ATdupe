"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seasonFor, ALL_SEASONS } from "../lib/seasons";
import { readParade, onParadeChange, SIZE_SCALE, type ParadeSettings } from "../lib/parade";
import { FOOTBALL_ART } from "./FootballArt";
import Llama from "./Llama";
import { celebrate } from "./celebrate";

const MAX = 40; // past this the strip is a crowd, not a count

// One walker per open task. When the count drops, one of them celebrates,
// which means it fires however the task was cleared.
export default function Parade({ count, label }: { count?: number; label?: string }) {
  const [cfg, setCfg] = useState<ParadeSettings | null>(null);
  const [cheer, setCheer] = useState<number | null>(null);
  const prev = useRef<number | undefined>(undefined);
  const refs = useRef<Record<number, HTMLSpanElement | null>>({});

  const refresh = useCallback(() => setCfg(readParade()), []);
  useEffect(() => { refresh(); return onParadeChange(refresh); }, [refresh]);

  const season = useMemo(() => {
    if (!cfg) return seasonFor();
    if (cfg.season !== "auto") {
      const s = ALL_SEASONS.find((x) => x.id === cfg.season);
      if (s) return s;
    }
    return seasonFor();
  }, [cfg]);

  const scale = SIZE_SCALE[cfg?.size || "l"] || 1;
  const n = count === undefined ? 9 : Math.min(MAX, Math.max(0, count));

  const walkers = useMemo(() => {
    const art = season.art === "football" ? FOOTBALL_ART : null;
    const spread = Math.max(n, 6);
    return Array.from({ length: n }, (_, i) => {
      // Two llamas to every prop, so the llamas are clearly the parade.
      const isLlama = i % 3 !== 2;
      return {
        i,
        isLlama,
        Art: !isLlama && art ? art[i % art.length] : null,
        ch: season.cast[i % season.cast.length],
        delay: (i * (44 / spread)) % 44,
        dur: 34 + ((i * 7) % 16),
        size: Math.round((isLlama ? 34 : 20 + ((i * 4) % 10)) * scale),
        bob: 0.7 + ((i % 4) * 0.22),
      };
    });
  }, [season, scale, n]);

  // The count going down is the win. Pick someone and let them enjoy it.
  useEffect(() => {
    if (count === undefined) return;
    const before = prev.current;
    prev.current = count;
    if (before === undefined || count >= before) return;
    if (!cfg?.on || cfg.celebrate === "off") return;

    const pick = Math.floor(Math.random() * Math.max(1, Math.min(MAX, count || 1)));
    setCheer(pick);
    const el = refs.current[pick];
    const r = el?.getBoundingClientRect();
    const cast = season.art === "football" ? ["🏈", "🦙", "📣", "🎺"] : season.cast;
    celebrate(r ? r.left + r.width / 2 : window.innerWidth / 2,
              r ? r.top : window.innerHeight - 90, cast, true, true);
    const t = setTimeout(() => setCheer(null), 1600);
    return () => clearTimeout(t);
  }, [count, cfg, season]);

  if (!cfg?.on || n === 0) return null;
  const lane = Math.round(56 * scale) + 12;  // the llamas stand tall
  const title = label ? `${label}: ${count}${(count || 0) > MAX ? ` (showing ${MAX})` : ""}` : season.name;

  return (
    <div className="parade noprint" aria-hidden="true" title={title} style={{ height: lane }}>
      {walkers.map((w) => (
        <span key={w.i} className={"walker" + (cheer === w.i ? " cheering" : "")}
          ref={(el) => { refs.current[w.i] = el; }}
          style={{ animationDuration: `${w.dur}s`, animationDelay: `-${w.delay}s`, fontSize: w.size }}>
          <span className="bob" style={{ animationDuration: `${w.bob}s` }}>
            {w.isLlama ? <Llama season={season.id} /> : w.Art ? <w.Art /> : w.ch}
          </span>
        </span>
      ))}
    </div>
  );
}
