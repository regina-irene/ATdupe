import { readParade, SIZE_SCALE } from "./../lib/parade";

// A burst where the task was ticked. Deliberately brief.
export function celebrate(x: number, y: number, cast: string[], big = false, always = false) {
  if (typeof window === "undefined") return;
  const cfg = readParade();
  if (!cfg.on || cfg.celebrate === "off") return;
  if (!always && cfg.celebrate === "priority" && !big) return;

  // With reduced motion asked for, mark the moment without throwing things
  // around the screen.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    const tag = document.createElement("div");
    tag.className = "cheer";
    tag.textContent = "Done";
    tag.style.left = x + "px";
    tag.style.top = y + "px";
    document.body.appendChild(tag);
    setTimeout(() => tag.remove(), 1100);
    return;
  }

  const scale = SIZE_SCALE[cfg.size] || 1;
  const layer = document.createElement("div");
  layer.className = "burst";
  layer.style.left = x + "px";
  layer.style.top = y + "px";
  document.body.appendChild(layer);

  const n = big ? 16 : 11;
  for (let i = 0; i < n; i++) {
    const bit = document.createElement("span");
    bit.textContent = cast[i % cast.length];
    bit.style.fontSize = (13 + Math.random() * 13) * scale + "px";
    layer.appendChild(bit);

    const angle = Math.PI * (0.15 + Math.random() * 0.7) * -1;   // fan upward
    const dist = (55 + Math.random() * 95) * (0.85 + scale * 0.3);
    bit.animate(
      [
        { transform: "translate(0,0) scale(.5) rotate(0deg)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(1.1) rotate(${(Math.random() * 200 - 100) | 0}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(angle) * dist * 1.25}px, ${Math.sin(angle) * dist * 0.55 + 80}px) scale(.7) rotate(${(Math.random() * 320 - 160) | 0}deg)`, opacity: 0 },
      ],
      { duration: (900 + Math.random() * 450) * (big ? 1.2 : 1), easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
    );
  }
  setTimeout(() => layer.remove(), 1900);
}
