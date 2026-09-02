// A small burst where the task was ticked. Deliberately brief.
export function celebrate(x: number, y: number, cast: string[]) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try { if (localStorage.getItem("efl_parade") === "0") return; } catch {}

  const layer = document.createElement("div");
  layer.className = "burst";
  layer.style.left = x + "px";
  layer.style.top = y + "px";
  document.body.appendChild(layer);

  const n = 10;
  for (let i = 0; i < n; i++) {
    const bit = document.createElement("span");
    bit.textContent = cast[i % cast.length];
    bit.style.fontSize = 13 + Math.random() * 13 + "px";
    layer.appendChild(bit);

    const angle = (Math.PI * (0.15 + Math.random() * 0.7)) * -1; // upward fan
    const dist = 50 + Math.random() * 90;
    bit.animate(
      [
        { transform: "translate(0,0) scale(.5) rotate(0deg)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(1.1) rotate(${(Math.random() * 200 - 100) | 0}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(angle) * dist * 1.25}px, ${Math.sin(angle) * dist * 0.55 + 70}px) scale(.7) rotate(${(Math.random() * 320 - 160) | 0}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 450, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
    );
  }
  setTimeout(() => layer.remove(), 1500);
}
