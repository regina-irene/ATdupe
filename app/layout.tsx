import "./globals.css";

export const metadata = { title: "EFL Board", description: "Time, tasks, payments, cases and clients for Edwards Family Law", manifest: "/manifest.json", icons: { icon: "/efl-logo.png", apple: "/efl-logo.png" } };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3a5f" };

const BOOT = `(function(){try{var r=document.documentElement,g=function(k,d){return localStorage.getItem(k)||d};r.setAttribute('data-accent',g('efl_accent','navy'));r.setAttribute('data-density',g('efl_density','cozy'));r.setAttribute('data-rows',g('efl_rows','m'));r.setAttribute('data-look',g('efl_look','firm'));var m=g('efl_mode','light');r.setAttribute('data-mode',m==='auto'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):m);var p=location.pathname,k=p==='/'?'board':p.indexOf('/dashboard')===0?'dashboard':p.indexOf('/reports')===0?'reports':p.indexOf('/import')===0?'import':p.indexOf('/tasks')===0?'tasks':p.indexOf('/payments')===0?'payments':p.indexOf('/cases')===0?'cases':p.indexOf('/clients')===0?'clients':p.indexOf('/boards')===0?'boards':p.indexOf('/settings')===0?'setup':p.indexOf('/setup')===0?'setup':'board';r.setAttribute('data-page',k);var c=localStorage.getItem('efl_accent_hex');if(c){r.style.setProperty('--accent',c);r.style.setProperty('--accent-2',c)}var h=localStorage.getItem('efl_hues');if(h){h=JSON.parse(h);if(h[k])r.style.setProperty('--page',h[k])}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-accent="navy" data-mode="light" data-density="cozy" data-rows="m" data-look="firm" data-page="board">
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
