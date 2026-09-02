"use client";
import React from "react";

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

// A readable label instead of a 200 character Drive URL.
export function labelFor(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/drive\.google|docs\.google/.test(host)) {
      if (/\/spreadsheets\//.test(u.pathname)) return "Google Sheet";
      if (/\/document\//.test(u.pathname)) return "Google Doc";
      if (/\/presentation\//.test(u.pathname)) return "Slides";
      if (/\/folders\//.test(u.pathname)) return "Drive folder";
      return "Drive file";
    }
    if (/airtable\.com/.test(host)) return "Airtable";
    if (/dropbox\.com/.test(host)) return "Dropbox";
    if (/egnyte\.com/.test(host)) return "Egnyte";
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    if (last && last.length <= 42 && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
    return host;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "..." : url;
  }
}

// Turns any URLs inside a block of text into links, leaving the rest alone.
export default function Linkify({ text, short = true }: { text: any; short?: boolean }) {
  const s = String(text ?? "");
  if (!s) return null;
  if (!URL_RE.test(s)) { URL_RE.lastIndex = 0; return <>{s}</>; }
  URL_RE.lastIndex = 0;

  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = URL_RE.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const href = m[1].replace(/[.,;]+$/, "");
    out.push(
      <a key={i++} href={href} target="_blank" rel="noreferrer" className="filelink"
         title={href} onClick={(e) => e.stopPropagation()}>
        {short ? labelFor(href) : href}
      </a>
    );
    last = m.index + m[1].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
}
