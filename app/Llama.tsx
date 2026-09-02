"use client";
import React from "react";

// Front-facing, flat, one solid colour, in the spirit of the Monday llamas:
// tall neck, long ears, white face patch, four straight legs with pale hooves.
const HOOF = "#efeae1";
const INK = "#2b3a2f";

const COAT: Record<string, string> = {
  winter: "#5b8def",
  hearts: "#f2568e",
  spring: "#2fb573",
  easter: "#b58be0",
  bloom: "#f59fc4",
  summer: "#37bdd6",
  july: "#e2574c",
  peach: "#f79a4d",
  football: "#fb4f14",
  spooky: "#f28b30",
  harvest: "#c2703a",
  holiday: "#2fae66",
};

export default function Llama({ season, coat }: { season: string; coat?: string }) {
  const c = coat || COAT[season] || "#7bc47f";
  const kit = KIT[season];

  return (
    <svg viewBox="0 0 64 96" width="1em" height="1em" style={{ display: "block", overflow: "visible" }}>
      {/* legs */}
      <g fill={c}>
        <rect x="14" y="68" width="7.5" height="24" rx="3.6" />
        <rect x="23.5" y="68" width="7.5" height="24" rx="3.6" />
        <rect x="33" y="68" width="7.5" height="24" rx="3.6" />
        <rect x="42.5" y="68" width="7.5" height="24" rx="3.6" />
      </g>
      <g fill={HOOF}>
        <rect x="14" y="85" width="7.5" height="7" rx="3" />
        <rect x="23.5" y="85" width="7.5" height="7" rx="3" />
        <rect x="33" y="85" width="7.5" height="7" rx="3" />
        <rect x="42.5" y="85" width="7.5" height="7" rx="3" />
      </g>

      {/* body */}
      <rect x="10" y="42" width="44" height="32" rx="15" fill={c} />

      {/* neck */}
      <rect x="24.5" y="14" width="15" height="34" rx="7.5" fill={c} />

      {/* ears */}
      <g fill={c}>
        <rect x="22.5" y="-2" width="6.5" height="15" rx="3.2" transform="rotate(-10 25.7 5.5)" />
        <rect x="35" y="-2" width="6.5" height="15" rx="3.2" transform="rotate(10 38.2 5.5)" />
      </g>

      {/* head */}
      <rect x="21.5" y="6" width="21" height="21" rx="9.5" fill={c} />

      {/* face */}
      <rect x="26" y="10" width="12" height="15" rx="6" fill="#fff" />
      <circle cx="29.4" cy="16" r="1.7" fill={INK} />
      <circle cx="34.6" cy="16" r="1.7" fill={INK} />
      <path d="M30.6 20.4h2.8" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />

      {kit || null}
    </svg>
  );
}

const KIT: Record<string, React.ReactNode> = {
  // September: helmet and facemask, jersey number on the body.
  football: (
    <g>
      <path d="M20 14a12 12 0 0 1 24 0v5H20z" fill="#0b2343" />
      <path d="M20 17h24v3.5H20z" fill="#0b2343" />
      <path d="M24 21v6M32 21v6M40 21v6" stroke="#fb4f14" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M23 27h18" stroke="#fb4f14" strokeWidth="1.7" strokeLinecap="round" />
      <text x="32" y="63" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0b2343"
        fontFamily="system-ui, sans-serif">7</text>
    </g>
  ),
  holiday: (
    <g>
      <path d="M19 12a13 13 0 0 1 26 0z" fill="#c0392b" />
      <rect x="17" y="10" width="30" height="5" rx="2.5" fill="#fff" />
      <circle cx="46" cy="8" r="4" fill="#fff" />
      <g transform="translate(46,40)">
        <path d="M6 22H-6l4-7h-3l4-7h-2l3-6 3 6h-2l4 7H2z" fill="#1f7a44" />
        <rect x="-1.6" y="22" width="3.2" height="5" fill="#7b4a25" />
        <circle cx="0" cy="2" r="1.7" fill="#f5c518" />
      </g>
    </g>
  ),
  spooky: (
    <g>
      <path d="M14 14h36l-18-16z" fill="#4c1d95" />
      <rect x="12" y="13" width="40" height="4" rx="2" fill="#4c1d95" />
      <rect x="24" y="9" width="16" height="3" fill="#f59e0b" />
      <g transform="translate(48,52)">
        <circle r="9" fill="#f97316" />
        <path d="M0-9v-4" stroke="#3f6212" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M-4-2l2 3-2 3M4-2l-2 3 2 3" stroke="#7c2d12" strokeWidth="1.4" fill="none" />
      </g>
    </g>
  ),
  harvest: (
    <g>
      <rect x="22" y="-2" width="20" height="12" rx="1.5" fill="#3f3f46" />
      <rect x="16" y="9" width="32" height="4" rx="2" fill="#3f3f46" />
      <rect x="22" y="4" width="20" height="4" fill="#f5c518" />
      <g transform="translate(49,55)">
        <ellipse rx="10" ry="4.5" fill="#e8b96a" />
        <ellipse cy="-2.5" rx="8" ry="3.5" fill="#f5d69a" />
      </g>
    </g>
  ),
  winter: (
    <g>
      <path d="M20 12a12 12 0 0 1 24 0z" fill="#1d4ed8" />
      <rect x="18" y="10" width="28" height="4.5" rx="2.2" fill="#fff" />
      <circle cx="32" cy="-3" r="4.5" fill="#fff" />
      <path d="M22 34h20v7H22z" fill="#c0392b" />
      <path d="M40 41l5 14-6 1-3-14z" fill="#c0392b" />
      <path d="M22 36h20M22 38.5h20" stroke="#fff" strokeWidth="1.1" />
    </g>
  ),
  hearts: (
    <g>
      <path d="M32 2c0-3 2.4-5.4 5.4-5.4 1.9 0 3.5 1 4.4 2.4.9-1.4 2.5-2.4 4.4-2.4C49.2-3.4 51.6-1 51.6 2c0 6-9.8 11-9.8 11S32 8 32 2z"
        fill="#e11d48" transform="translate(-10,-2) scale(.72)" />
      <rect x="21" y="10" width="22" height="3.4" rx="1.7" fill="#e11d48" />
    </g>
  ),
  spring: (
    <g>
      <rect x="22" y="-2" width="20" height="11" rx="1.5" fill="#15803d" />
      <rect x="16" y="8" width="32" height="4" rx="2" fill="#15803d" />
      <rect x="22" y="3.5" width="20" height="3.4" fill="#f5c518" />
      <g transform="translate(48,54)" fill="#22c55e">
        <circle cx="0" cy="-4" r="3.4" /><circle cx="-4" cy="1" r="3.4" />
        <circle cx="4" cy="1" r="3.4" /><circle cx="0" cy="5" r="2.4" />
      </g>
    </g>
  ),
  easter: (
    <g fill="#fff" stroke="#e9c4d6" strokeWidth="1.2">
      <ellipse cx="25" cy="0" rx="4" ry="11" transform="rotate(-10 25 0)" />
      <ellipse cx="39" cy="0" rx="4" ry="11" transform="rotate(10 39 0)" />
      <g stroke="none">
        <ellipse cx="49" cy="55" rx="7" ry="9" fill="#a7f3d0" />
        <path d="M42 53h14M42 58h14" stroke="#f472b6" strokeWidth="2" />
      </g>
    </g>
  ),
  bloom: (
    <g>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={20 + i * 4.8} cy={9 - (i % 2) * 2} r="3.1"
          fill={["#f472b6", "#facc15", "#fb923c", "#f472b6", "#facc15", "#fb923c"][i]} />
      ))}
      <g transform="translate(49,55)">
        <circle r="5.5" fill="#facc15" /><circle r="2.2" fill="#a16207" />
      </g>
    </g>
  ),
  summer: (
    <g>
      <rect x="24" y="13" width="16" height="5" rx="1.4" fill="#1f2937" />
      <circle cx="28.4" cy="15.5" r="3.4" fill="#111827" />
      <circle cx="35.6" cy="15.5" r="3.4" fill="#111827" />
      <ellipse cx="32" cy="60" rx="27" ry="10" fill="none" stroke="#f97316" strokeWidth="5" opacity=".92" />
    </g>
  ),
  july: (
    <g>
      <rect x="22" y="-2" width="20" height="11" rx="1.5" fill="#1e3a8a" />
      <rect x="16" y="8" width="32" height="4" rx="2" fill="#b91c1c" />
      <rect x="22" y="3.2" width="20" height="3.4" fill="#fff" />
      <path d="M50 62V38" stroke="#7b4a25" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="50" y="38" width="13" height="9" fill="#b91c1c" />
      <rect x="50" y="38" width="6" height="5" fill="#1e3a8a" />
    </g>
  ),
  peach: (
    <g>
      <ellipse cx="32" cy="10" rx="18" ry="4.5" fill="#e8d5a3" />
      <ellipse cx="32" cy="6.5" rx="11" ry="6" fill="#e8d5a3" />
      <rect x="21" y="8" width="22" height="3.4" fill="#c0392b" />
      <g transform="translate(49,55)">
        <circle r="8" fill="#fb923c" />
        <path d="M0-8c2-3 5-3.6 7-3" stroke="#3f6212" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  ),
};
