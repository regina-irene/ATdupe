"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { seasonFor, ALL_SEASONS } from "../lib/seasons";
import { readParade, onParadeChange, SIZE_SCALE, type ParadeSettings } from "../lib/parade";
import { FOOTBALL_ART } from "./FootballArt";

const MAX = 40; // past this the strip is a crowd, not a count

// One walker per open task, so the parade is the size of the pile.
export default function Parade({ count, label }: { count?: number; label?: string }) {
  const [cfg, setCfg] = useState<ParadeSettings | null>(null);
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
    return Array.from({ length: n }, (_, i) => ({
      i,
      Art: art ? art[i % art.length] : null,
      ch: season.cast[i % season.cast.length],
      delay: (i * (44 / spread)) % 44,
      dur: 34 + ((i * 7) % 16),
      size: Math.round((22 + ((i * 5) % 12)) * scale),
      bob: 0.7 + ((i % 4) * 0.22),
    }));
  }, [season, scale, n]);

  if (!cfg?.on || n === 0) return null;
  const lane = Math.round(38 * scale) + 16;
  const title = label
    ? `${label}: ${count}${(count || 0) > MAX ? ` (showing ${MAX})` : ""}`
    : season.name;

  return (
    <div className="parade noprint" aria-hidden="true" title={title} style={{ height: lane }}>
      {walkers.map((w) => (
        <span key={w.i} className="walker"
          style={{ animationDuration: `${w.dur}s`, animationDelay: `-${w.delay}s`, fontSize: w.size }}>
          <span className="bob" style={{ animationDuration: `${w.bob}s` }}>
            {w.Art ? <w.Art /> : w.ch}
          </span>
        </span>
      ))}
    </div>
  );
}
