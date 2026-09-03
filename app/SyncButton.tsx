"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Airtable's mark: three coloured bars plus the blue slab. Drawn inline so it
// needs no network request and picks up the button's size.
export function AirtableLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 170" aria-hidden="true" focusable="false">
      <path fill="#FFBF00" d="M90.039,12.331 L24.039,39.661 C20.369,41.181 20.409,46.411 24.109,47.861 L90.379,74.121 C96.129,76.401 102.529,76.401 108.279,74.121 L174.549,47.861 C178.249,46.411 178.289,41.181 174.619,39.661 L108.619,12.331 C102.639,9.851 96.019,9.851 90.039,12.331" />
      <path fill="#26B5F8" d="M105.091,88.149 L105.091,153.859 C105.091,156.989 108.251,159.139 111.161,157.989 L184.951,129.339 C186.641,128.669 187.751,127.029 187.751,125.209 L187.751,59.499 C187.751,56.369 184.591,54.219 181.681,55.369 L107.891,83.019 C106.201,83.689 105.091,85.329 105.091,87.149" />
      <path fill="#ED3049" d="M87.813,90.688 L65.903,101.268 L63.683,102.348 L17.463,124.508 C14.523,125.918 10.753,123.778 10.753,120.518 L10.753,59.748 C10.753,58.568 11.358,57.548 12.173,56.778 C12.513,56.438 12.898,56.158 13.298,55.928 C14.408,55.268 15.993,55.088 17.338,55.618 L87.433,83.378 C91.003,84.798 91.283,89.008 87.813,90.688" />
      <path fill="#000" opacity="0.25" d="M87.813,90.688 L65.903,101.268 L12.173,56.778 C12.513,56.438 12.898,56.158 13.298,55.928 C14.408,55.268 15.993,55.088 17.338,55.618 L87.433,83.378 C91.003,84.798 91.283,89.008 87.813,90.688" />
    </svg>
  );
}

// Actual date and time, never "19h ago".
function stampOf(iso?: string | null): string {
  if (!iso) return "Never synced";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Never synced";
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return "Last synced " + day + ", " + time;
}

// One shared fetch of every board's last-sync time, so a page holding several
// sync buttons asks once. `bump` invalidates it after a sync finishes.
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;
const watchers = new Set<(m: Record<string, string>) => void>();

function fetchLast(force = false): Promise<Record<string, string>> {
  if (force) { cache = null; inflight = null; }
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/sync/last")
      .then((r) => r.json())
      .then((j) => {
        cache = j?.last || {};
        watchers.forEach((w) => w(cache!));
        return cache!;
      })
      .catch(() => ({}))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useLastSync(key?: string, prefix?: string) {
  const [map, setMap] = useState<Record<string, string>>(cache || {});
  useEffect(() => {
    watchers.add(setMap);
    fetchLast();
    return () => { watchers.delete(setMap); };
  }, []);
  const refresh = useCallback(() => { fetchLast(true); }, []);
  // A button that syncs several boards at once reports the most recent of them.
  let at: string | undefined = key ? map[key] : undefined;
  if (!at && prefix) {
    for (const k of Object.keys(map)) {
      if (k.indexOf(prefix) !== 0) continue;
      if (!at || map[k] > at) at = map[k];
    }
  }
  return { at, refresh };
}

// The one Sync Airtable control, used on every board so it looks and behaves
// the same everywhere. `syncKey` is the board's key in sync_state
// (time, tasks, payments, status, clients, or b:<baseId>:<tableId>) and drives
// the last-synced line under the button.
export default function SyncButton({
  busy, onClick, label = "Sync Airtable", busyLabel = "Syncing...", title, syncKey, syncPrefix, stamp = true,
}: {
  busy?: boolean;
  onClick: () => void;
  label?: string;
  busyLabel?: string;
  title?: string;
  syncKey?: string;
  syncPrefix?: string;
  stamp?: boolean;
}) {
  const { at, refresh } = useLastSync(syncKey, syncPrefix);
  const was = useRef(!!busy);
  // Re-read the stamp the moment a sync finishes.
  useEffect(() => {
    if (was.current && !busy) refresh();
    was.current = !!busy;
  }, [busy, refresh]);

  const btn = (
    <button
      type="button"
      className={"btn sync-at" + (busy ? " is-busy" : "")}
      disabled={!!busy}
      onClick={onClick}
      title={title || "Push local edits to Airtable, then pull Airtable's changes back"}
    >
      <AirtableLogo size={22} />
      <span>{busy ? busyLabel : label}</span>
    </button>
  );

  if (!stamp) return btn;
  return (
    <div className="syncwrap">
      {btn}
      <span className="stamp" title={at ? new Date(at).toString() : "This board has not been synced yet"}>
        {busy ? "Syncing now..." : stampOf(at)}
      </span>
    </div>
  );
}
