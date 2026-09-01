"use client";
import { useEffect, useState } from "react";

const SIZES: [string, string, string][] = [
  ["s", "S", "One line per row"],
  ["m", "M", "Two lines per row"],
  ["l", "L", "Four lines per row"],
  ["xl", "XL", "Show everything, however long"],
];

// Sets how tall table rows are, everywhere at once. Saved on this computer.
export default function RowSize() {
  const [size, setSize] = useState("m");
  useEffect(() => {
    try { setSize(localStorage.getItem("efl_rows") || "m"); } catch {}
  }, []);
  function pick(v: string) {
    setSize(v);
    try { localStorage.setItem("efl_rows", v); } catch {}
    document.documentElement.setAttribute("data-rows", v);
  }
  return (
    <div className="seg rowsize" title="Row height">
      {SIZES.map(([id, label, hint]) => (
        <button key={id} className={size === id ? "on" : ""} title={hint} onClick={() => pick(id)}>{label}</button>
      ))}
    </div>
  );
}
