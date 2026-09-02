"use client";
import React from "react";

// Drawn rather than emoji, because there is no helmet, goalpost or jersey in
// the emoji set. Sized by font-size so they scale with the rest of the parade.
const box = (children: React.ReactNode, vb = "0 0 32 32") => (
  <svg viewBox={vb} width="1em" height="1em" style={{ display: "block", overflow: "visible" }}>{children}</svg>
);

const NAVY = "#0b2343";
const ORANGE = "#fb4f14";

export const Football = () => box(
  <g>
    <ellipse cx="16" cy="16" rx="13" ry="8" fill="#7b3f1d" stroke="#5a2c12" strokeWidth="1.2" />
    <path d="M6 16h20" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M13 13v6M16 12.4v7.2M19 13v6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M4.4 16c1.6-2.2 1.6-5.8 0-8M27.6 16c-1.6-2.2-1.6-5.8 0-8" stroke="#5a2c12" strokeWidth="1.1" fill="none" transform="translate(0,4)" />
  </g>
);

export const Helmet = () => box(
  <g>
    <path d="M6 17a10 10 0 0 1 20 0v3a2 2 0 0 1-2 2h-4l-1-5H8a2 2 0 0 1-2-2z" fill={NAVY} />
    <path d="M9 12.5a8.5 8.5 0 0 1 13 1.5" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M19 22c3 0 5.5-1.4 6.4-3.6" stroke={ORANGE} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M17.5 25.5c3.6 0 6.6-1.6 7.8-4" stroke={ORANGE} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M24.6 18.4v7" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" />
  </g>
);

export const Goalpost = () => box(
  <g stroke="#f5c518" strokeWidth="2.6" strokeLinecap="round" fill="none">
    <path d="M16 29V17" />
    <path d="M8 17h16" />
    <path d="M8 17V6M24 17V6" />
  </g>
);

export const Jersey = () => box(
  <g>
    <path d="M11 7 6 10l2.5 5 2.5-1.5V26h10V13.5L23.5 15 26 10l-5-3-2.5 2.2h-5z" fill={ORANGE} stroke={NAVY} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M13.5 7h5l-2.5 2.4z" fill={NAVY} />
    <text x="16" y="22" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={NAVY} fontFamily="system-ui, sans-serif">7</text>
  </g>
);

export const Flag = () => box(
  <g>
    <path d="M9 27V6" stroke="#6b4a1f" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.8 7c4 -1.6 8 2.4 12 .8 -1.4 3.6 -1.4 6 0 8.6 -4 1.6 -8 -2.4 -12 -.8z" fill="#f5c518" stroke="#c99a09" strokeWidth="1" />
  </g>
);

export const FOOTBALL_ART = [Football, Helmet, Jersey, Goalpost, Flag];
