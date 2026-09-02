"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { seasonFor, ALL_SEASONS } from "../lib/seasons";
import { readParade, onParadeChange, SIZE_SCALE, type ParadeSettings } from "../lib/parade";

// A slow procession along the foot of the page.
export default function Parade() {
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

  const walkers = useMemo(() => {
    const cast = season.cast;
    return Array.from({ length: 9 }, (_, i) => ({
      ch: cast[i % cast.length],
      delay: (i * 4.4) % 40,
      dur: 34 + ((i * 7) % 16),
      size: Math.round((22 + ((i * 5) % 12)) * scale),
      bob: 0.7 + ((i % 4) * 0.22),
    }));
  }, [season, scale]);

  if (!cfg?.on) return null;
  const lane = Math.round(38 * scale) + 16;

  return (
    <div className="parade noprint" aria-hidden="true" title={season.name} style={{ height: lane }}>
      {walkers.map((w, i) => (
        <span key={i} className="walker"
          style={{ animationDuration: `${w.dur}s`, animationDelay: `-${w.delay}s`, fontSize: w.size }}>
          <span className="bob" style={{ animationDuration: `${w.bob}s` }}>{w.ch}</span>
        </span>
      ))}
    </div>
  );
}
