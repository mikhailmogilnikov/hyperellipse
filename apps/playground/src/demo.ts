import { registerHyperellipse } from "hyperellipse";

const params = new URLSearchParams(window.location.search);
const force = params.get("mode") === "force";

// Эмуляция Safari/FF в Chrome: @supports not (corner-shape) тут не сработает,
// выставляем редукцию вручную, чтобы проверить, что движок читает полный радиус.
// if (force) {
//   document.documentElement.style.setProperty("--corner-scale", "0.6");
// }

// setTimeout(() => {
const controller = registerHyperellipse({ force });

const label = document.getElementById("mode-label");
if (label) {
  label.textContent = force
    ? `FALLBACK (force) — native support: ${controller.supported}`
    : `NATIVE — native support: ${controller.supported}`;
}
// }, 1000);
