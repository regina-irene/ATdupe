"use client";
import { useEffect, useMemo, useState } from "react";
import { seasonFor, ALL_SEASONS } from "../lib/seasons";

// A slow procession along the foot of the page. Off by default for anyone who
// would rather not have it, and always off when the system asks for less motion.
export default function Parade() {
  const [on, setOn] = useState(false);
  const [pick, setPick] = useState("auto");

  useEffect(() => {
    try {
      setOn(localStorage.getItem("efl_parade") !== "0");
      setPick(localStorage.getItem("efl_parade_season") || "auto");
    } catch {}
  }, []);

  const season = useMemo(() => {
    if (pick !== "auto") {
      const s = ALL_SEASONS.find((x) => x.id === pick);
      if (s) return s;
    }
    return seasonFor();
  }, [pick]);

  const walkers = useMemo(() => {
    const cast = season.cast;
    return Array.from({ length: 9 }, (_, i) => ({
      ch: cast[i % cast.length],
      delay: (i * 4.4) % 40,
      dur: 34 + ((i * 7) % 16),
      size: 20 + ((i * 5) % 12),
      bob: 0.7 + ((i % 4) * 0.22),
    }));
  }, [season]);

  if (!on) return null;

  return (
    <div className="parade noprint" aria-hidden="true" title={season.name}>
      {walkers.map((w, i) => (
        <span key={i} className="walker"
          style={{
            animationDuration: `${w.dur}s`,
            animationDelay: `-${w.delay}s`,
            fontSize: w.size,
          }}>
          <span className="bob" style={{ animationDuration: `${w.bob}s` }}>{w.ch}</span>
        </span>
      ))}
    </div>
  );
}
