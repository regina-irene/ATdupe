import "./globals.css";

export const metadata = { title: "EFL Time Board", description: "Time and tasks for Edwards Family Law", manifest: "/manifest.json" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3a5f" };

const BOOT = `(function(){try{var r=document.documentElement;r.setAttribute('data-accent',localStorage.getItem('efl_accent')||'navy');r.setAttribute('data-density',localStorage.getItem('efl_density')||'cozy');var m=localStorage.getItem('efl_mode')||'light';r.setAttribute('data-mode',m==='auto'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):m);var p=location.pathname;r.setAttribute('data-page',p==='/'?'board':p.indexOf('/reports')===0?'reports':p.indexOf('/import')===0?'import':p.indexOf('/tasks')===0?'tasks':p.indexOf('/setup')===0?'setup':'board');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-accent="navy" data-mode="light" data-density="cozy" data-page="board">
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
