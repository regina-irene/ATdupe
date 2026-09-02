"use client";
import React from "react";

// One llama, dressed for the month. Drawn rather than emoji so it can wear a
// helmet in September and carry a tree in December.
const WOOL = "#f4ece0";
const WOOL_SHADE = "#e2d4c2";
const LINE = "#8d7b66";
const NAVY = "#0b2343";
const ORANGE = "#fb4f14";

function Base({ blanket, children }: { blanket?: string; children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" width="1em" height="1em" style={{ display: "block", overflow: "visible" }}>
      {/* legs */}
      <g stroke={LINE} strokeWidth="1" fill={WOOL_SHADE}>
        <rect x="20" y="40" width="5" height="15" rx="2.4" />
        <rect x="38" y="40" width="5" height="15" rx="2.4" />
        <rect x="26" y="41" width="5" height="14" rx="2.4" fill={WOOL} />
        <rect x="44" y="41" width="5" height="14" rx="2.4" fill={WOOL} />
      </g>
      {/* tail */}
      <circle cx="17" cy="32" r="4" fill={WOOL} stroke={LINE} strokeWidth="1" />
      {/* body */}
      <rect x="17" y="26" width="34" height="18" rx="9" fill={WOOL} stroke={LINE} strokeWidth="1.2" />
      {blanket ? <path d="M25 27h16a9 9 0 0 1 0 8H25z" fill={blanket} opacity="0.95" /> : null}
      {/* neck */}
      <path d="M44 40V20a6 6 0 0 1 12 0v20z" fill={WOOL} stroke={LINE} strokeWidth="1.2" />
      {/* head */}
      <ellipse cx="52" cy="16" rx="8.5" ry="6.5" fill={WOOL} stroke={LINE} strokeWidth="1.2" />
      <ellipse cx="58.5" cy="18" rx="3.6" ry="3" fill={WOOL_SHADE} stroke={LINE} strokeWidth="1" />
      <circle cx="60" cy="17.4" r="0.8" fill={LINE} />
      {/* ears */}
      <path d="M47 11l-1.5-7 5 4z" fill={WOOL} stroke={LINE} strokeWidth="1" strokeLinejoin="round" />
      <path d="M54 10l1-7 3.5 5z" fill={WOOL} stroke={LINE} strokeWidth="1" strokeLinejoin="round" />
      {/* eye */}
      <circle cx="53.5" cy="14.5" r="1.5" fill="#3a2f22" />
      <circle cx="54" cy="14" r="0.5" fill="#fff" />
      {children}
    </svg>
  );
}

const KIT: Record<string, React.ReactNode> = {
  // September: helmet with a facemask, and a jersey on the back.
  football: (
    <g>
      <path d="M44 13a8.5 8.5 0 0 1 17 0v3a1.6 1.6 0 0 1-1.6 1.6h-3l-.8-4H45.6A1.6 1.6 0 0 1 44 12z" fill={NAVY} />
      <path d="M46.5 9.5a7 7 0 0 1 11 1.2" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M56 18c2.4 0 4.4-1.1 5.2-2.9M55 20.6c2.9 0 5.3-1.3 6.3-3.2" stroke={ORANGE} strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path d="M61.2 15v5" stroke={ORANGE} strokeWidth="1.7" strokeLinecap="round" />
    </g>
  ),
  // December: a tree strapped on.
  holiday: (
    <g>
      <path d="M26 27l-6 0 4-6-4 0 5-7 5 7-4 0 4 6z" fill="#2f7d43" stroke="#1f5a2f" strokeWidth="0.9" strokeLinejoin="round" transform="translate(4,-4)" />
      <rect x="28" y="22" width="3" height="4" fill="#7b4a25" />
      <circle cx="29" cy="12" r="1.4" fill="#f5c518" />
      <path d="M45 12a7 7 0 0 1 13 1l-1 3H46z" fill="#c0392b" />
      <path d="M44 15.5h14v3H44z" fill="#fff" rx="1" />
      <circle cx="43" cy="17" r="2.6" fill="#fff" />
    </g>
  ),
  spooky: (
    <g>
      <path d="M52 8l-6 3h13z" fill="#4c1d95" />
      <path d="M52 8l-2.5-8 8 5z" fill="#4c1d95" />
      <path d="M45.5 10.5h13v2h-13z" fill="#f59e0b" />
      <circle cx="26" cy="24" r="6" fill="#f97316" stroke="#c2410c" strokeWidth="1" />
      <path d="M26 18v-3" stroke="#3f6212" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  ),
  harvest: (
    <g>
      <rect x="45" y="4" width="13" height="7" rx="1" fill="#3f3f46" />
      <rect x="42" y="10" width="19" height="2.6" rx="1" fill="#3f3f46" />
      <rect x="45" y="7" width="13" height="2.4" fill="#f5c518" />
      <ellipse cx="27" cy="24" rx="7" ry="3" fill="#e8b96a" stroke="#b07d33" strokeWidth="1" />
    </g>
  ),
  winter: (
    <g>
      <path d="M44 22h13v4H44z" fill="#c0392b" />
      <path d="M45 26l-3 8 4 1 2-8z" fill="#c0392b" />
      <path d="M44 23.5h13M44 25h13" stroke="#fff" strokeWidth="0.7" />
      <path d="M46 6h11l-1.5 5h-8z" fill="#2563eb" />
      <circle cx="51.5" cy="4.5" r="2.4" fill="#fff" />
    </g>
  ),
  hearts: (
    <g>
      <path d="M26 20c0-2.2 1.8-4 4-4 1.4 0 2.6.7 3.3 1.8.7-1.1 1.9-1.8 3.3-1.8 2.2 0 4 1.8 4 4 0 4.4-7.3 8-7.3 8S26 24.4 26 20z" fill="#e11d48" transform="translate(-2,-6) scale(.8)" />
      <path d="M46 9h12v2H46z" fill="#e11d48" />
      <circle cx="52" cy="6" r="3" fill="#e11d48" />
    </g>
  ),
  spring: (
    <g>
      <rect x="45" y="5" width="13" height="6" rx="1" fill="#15803d" />
      <rect x="42" y="10" width="19" height="2.4" rx="1" fill="#15803d" />
      <rect x="45" y="8" width="13" height="2" fill="#f5c518" />
      <circle cx="26" cy="23" r="2.2" fill="#22c55e" />
      <circle cx="29" cy="21" r="2.2" fill="#22c55e" />
      <circle cx="23" cy="21" r="2.2" fill="#22c55e" />
    </g>
  ),
  easter: (
    <g>
      <path d="M47 10c-1-6 0-10 1.5-10S51 4 50.5 10z" fill="#fff" stroke="#e5b8c8" strokeWidth="1" />
      <path d="M55 9c-.5-6 .8-10 2.3-9.6S59 4 58.5 9z" fill="#fff" stroke="#e5b8c8" strokeWidth="1" />
      <ellipse cx="27" cy="23" rx="5" ry="6.5" fill="#a7f3d0" stroke="#4bb99a" strokeWidth="1" />
      <path d="M22 23h10M22 26h10" stroke="#f472b6" strokeWidth="1.4" />
    </g>
  ),
  bloom: (
    <g>
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={46 + i * 3.2} cy={9 - (i % 2) * 1.6} r="2.3"
          fill={["#f472b6", "#facc15", "#fb923c", "#f472b6", "#facc15"][i]} />
      ))}
      <circle cx="27" cy="22" r="3" fill="#facc15" />
      <circle cx="27" cy="22" r="1.2" fill="#a16207" />
    </g>
  ),
  summer: (
    <g>
      <path d="M46 13h11v3.4H46z" fill="#1f2937" />
      <circle cx="48.5" cy="14.7" r="3" fill="#111827" />
      <circle cx="56" cy="14.7" r="3" fill="#111827" />
      <ellipse cx="34" cy="35" rx="20" ry="8" fill="none" stroke="#38bdf8" strokeWidth="3.4" opacity=".9" />
    </g>
  ),
  july: (
    <g>
      <rect x="45" y="4" width="13" height="7" rx="1" fill="#1e3a8a" />
      <rect x="42" y="10" width="19" height="2.6" rx="1" fill="#b91c1c" />
      <rect x="45" y="7.4" width="13" height="2" fill="#fff" />
      <path d="M24 24V12" stroke="#7b4a25" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24.8 12h9v6h-9z" fill="#b91c1c" />
      <path d="M24.8 12h4v3h-4z" fill="#1e3a8a" />
    </g>
  ),
  peach: (
    <g>
      <ellipse cx="52" cy="9" rx="10" ry="3" fill="#e8d5a3" />
      <ellipse cx="52" cy="7.5" rx="6" ry="3.4" fill="#e8d5a3" stroke="#c4a86b" strokeWidth="0.9" />
      <path d="M46 9h12" stroke="#c0392b" strokeWidth="1.6" />
      <circle cx="27" cy="23" r="5.4" fill="#fb923c" stroke="#c2410c" strokeWidth="1" />
      <path d="M27 17.6c1.4-2 3.4-2.4 4.6-2" stroke="#3f6212" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  ),
};

export default function Llama({ season }: { season: string }) {
  const blanket =
    season === "football" ? ORANGE :
    season === "holiday" ? "#c0392b" :
    season === "spooky" ? "#7c3aed" :
    season === "hearts" ? "#f472b6" :
    season === "spring" ? "#16a34a" :
    season === "july" ? "#1e3a8a" :
    season === "winter" ? "#2563eb" :
    season === "peach" ? "#fb923c" :
    season === "harvest" ? "#b45309" :
    season === "bloom" ? "#f472b6" :
    season === "easter" ? "#a7f3d0" :
    season === "summer" ? "#38bdf8" : undefined;

  return <Base blanket={blanket}>{KIT[season] || null}</Base>;
}
