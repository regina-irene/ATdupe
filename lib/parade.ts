// Parade settings live in the browser and are shared between the strip at the
// foot of the page and the burst that fires when a task is ticked.
export type ParadeSettings = {
  on: boolean;
  size: "s" | "m" | "l" | "xl";
  season: string;          // "auto" or a season id
  celebrate: "all" | "priority" | "off";
};

export const SIZE_SCALE: Record<string, number> = { s: 0.8, m: 1, l: 1.45, xl: 2 };
const EVENT = "efl:parade";

export function readParade(): ParadeSettings {
  const g = (k: string, d: string) => {
    try { return localStorage.getItem(k) ?? d; } catch { return d; }
  };
  return {
    on: g("efl_parade", "1") !== "0",
    size: (g("efl_parade_size", "l") as any),
    season: g("efl_parade_season", "auto"),
    celebrate: (g("efl_parade_celebrate", "all") as any),
  };
}

export function writeParade(patch: Partial<ParadeSettings>) {
  const map: Record<string, string> = {
    on: "efl_parade", size: "efl_parade_size", season: "efl_parade_season", celebrate: "efl_parade_celebrate",
  };
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      localStorage.setItem(map[k], k === "on" ? (v ? "1" : "0") : String(v));
    }
  } catch {}
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch {}
}

export function onParadeChange(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener("storage", fn); };
}
