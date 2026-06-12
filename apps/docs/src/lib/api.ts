export const supportedValuesCode = `--corner-shape: squircle;
--corner-shape: superellipse(4);
--corner-shape: squircle bevel scoop notch;

/* keywords: round, squircle, square, bevel, scoop, notch, superellipse(K) */`;

export const dataCornerShapeCode = `<div data-corner-shape="squircle" style="border-radius: 32px"></div>`;

export const registerApiCode = `import { registerHyperellipse } from "hyperellipse";

const controller = registerHyperellipse({
  selector: ".card", // extra selectors (cross-origin sheets)
  pendingRadiusScale: 0.6, // radius scale after JS loads
  force: false, // force fallback in supporting browsers
});

controller.supported; // native corner-shape?
controller.active; // fallback engine running?
controller.refresh(); // rescan + recompute
controller.destroy(); // tear down`;
