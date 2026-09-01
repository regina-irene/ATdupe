"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import ThemeMenu from "./ThemeMenu";

const SETUP_PAGES = [
  { href: "/setup", id: "setup", label: "Status" },
  { href: "/settings", id: "settings", label: "Appearance" },
];

const TIME_PAGES = [
  { href: "/", id: "board", label: "Board" },
  { href: "/reports", id: "reports", label: "Reports" },
  { href: "/import", id: "import", label: "Data" },
];

function pageKey(p: string) {
  if (p.startsWith("/reports")) return "reports";
  if (p.startsWith("/import")) return "import";
  if (p.startsWith("/tasks")) return "tasks";
  if (p.startsWith("/payments")) return "payments";
  if (p.startsWith("/cases")) return "cases";
  if (p.startsWith("/clients")) return "clients";
  if (p.startsWith("/boards")) return "boards";
  if (p.startsWith("/dashboard")) return "dashboard";
  if (p.startsWith("/settings")) return "settings";
  if (p.startsWith("/setup")) return "setup";
  return "board";
}

export default function Nav({ name }: { name?: string }) {
  const path = usePathname() || "/";
  const key = pageKey(path);
  const group = key === "settings" ? "setup"
    : ["dashboard", "tasks", "payments", "cases", "clients", "boards", "setup"].indexOf(key) >= 0 ? key : "time";

  // Settings shares the Setup hue, and any saved tab colour wins.
  useEffect(() => {
    const r = document.documentElement;
    const hue = key === "settings" ? "setup" : key;
    r.setAttribute("data-page", hue);
    try {
      const saved = JSON.parse(localStorage.getItem("efl_hues") || "{}");
      if (saved[hue]) r.style.setProperty("--page", saved[hue]);
      else r.style.removeProperty("--page");
    } catch {}
  }, [key]);

  const top = (href: string, label: string, id: string) => (
    <a key={id} href={href} className={group === id ? "on" : ""}>{label}{group === id ? <i /> : null}</a>
  );

  return (
    <>
      <div className="topbar noprint">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/efl-logo.png" alt="Edwards Family Law" className="logo" width={26} height={26} />
          EFL Board
        </div>
        <nav>
          {top("/dashboard", "Dashboard", "dashboard")}
          {top("/", "Time", "time")}
          {top("/tasks", "Tasks", "tasks")}
          {top("/payments", "Payments", "payments")}
          {top("/cases", "Case Status", "cases")}
          {top("/clients", "Clients", "clients")}
          {top("/boards", "Client Boards", "boards")}
          {top("/setup", "Setup", "setup")}
        </nav>
        <div className="who">
          {name ? <span>{name}</span> : null}
          {name ? <a href="/api/auth/logout">Sign out</a> : null}
          <ThemeMenu />
        </div>
      </div>
      <div className="pagebar noprint" />
      {group === "time" || group === "setup" ? (
        <div className="subnav noprint">
          {(group === "time" ? TIME_PAGES : SETUP_PAGES).map((p) => (
            <a key={p.id} href={p.href} className={key === p.id ? "on" : ""}>{p.label}</a>
          ))}
        </div>
      ) : null}
    </>
  );
}
