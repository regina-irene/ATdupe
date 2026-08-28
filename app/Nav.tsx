"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import ThemeMenu from "./ThemeMenu";

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
  if (p.startsWith("/setup")) return "setup";
  return "board";
}

export default function Nav({ name }: { name?: string }) {
  const path = usePathname() || "/";
  const key = pageKey(path);
  const group = ["tasks", "payments", "cases", "clients", "setup"].indexOf(key) >= 0 ? key : "time";

  useEffect(() => { document.documentElement.setAttribute("data-page", key); }, [key]);

  const top = (href: string, label: string, id: string) => (
    <a key={id} href={href} className={group === id ? "on" : ""}>{label}{group === id ? <i /> : null}</a>
  );

  return (
    <>
      <div className="topbar noprint">
        <div className="brand"><span className="dot">E</span> Time Board</div>
        <nav>
          {top("/", "Time", "time")}
          {top("/tasks", "Tasks", "tasks")}
          {top("/payments", "Payments", "payments")}
          {top("/cases", "Cases", "cases")}
          {top("/clients", "Clients", "clients")}
          {top("/setup", "Setup", "setup")}
        </nav>
        <div className="who">
          {name ? <span>{name}</span> : null}
          {name ? <a href="/api/auth/logout">Sign out</a> : null}
          <ThemeMenu />
        </div>
      </div>
      <div className="pagebar noprint" />
      {group === "time" ? (
        <div className="subnav noprint">
          {TIME_PAGES.map((p) => (
            <a key={p.id} href={p.href} className={key === p.id ? "on" : ""}>{p.label}</a>
          ))}
        </div>
      ) : null}
    </>
  );
}
