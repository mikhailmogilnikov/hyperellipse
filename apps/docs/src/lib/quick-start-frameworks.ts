import type { CodeTab } from "./highlight";

const astroRegisterCode = [
  "<script>",
  '  import { registerHyperellipse } from "hyperellipse";',
  "",
  "  registerHyperellipse();",
  "</script>",
].join("\n");

export const frameworkTabs: CodeTab[] = [
  {
    code: `"use client";

import { useEffect } from "react";
import { registerHyperellipse } from "hyperellipse";

export function RegisterHyperellipse() {
  useEffect(() => {
    registerHyperellipse();
  }, []);

  return null;
}`,
    id: "react",
    label: "React",
    lang: "tsx",
  },
  {
    code: `import { createApp } from "vue";
import { registerHyperellipse } from "hyperellipse";
import App from "./App.vue";

registerHyperellipse();

createApp(App).mount("#app");`,
    id: "vue",
    label: "Vue",
    lang: "typescript",
  },
  {
    code: `import { mount } from "svelte";
import { registerHyperellipse } from "hyperellipse";
import App from "./App.svelte";

registerHyperellipse();

mount(App, { target: document.getElementById("app")! });`,
    id: "svelte",
    label: "Svelte",
    lang: "typescript",
  },
  {
    code: astroRegisterCode,
    id: "astro",
    label: "Astro",
    lang: "astro",
  },
  {
    code: `import { registerHyperellipse } from "hyperellipse";

registerHyperellipse();`,
    id: "vanilla",
    label: "Vanilla",
    lang: "typescript",
  },
];

export const stylingCode = `.button {
  corner-shape: squircle;
  --corner-shape: squircle;
  border-radius: 45px;
  background: #2563eb;
}`;

export const ssrFallbackCode = `@import "hyperellipse/css";

.button {
  --corner-shape: squircle;
  border-radius: calc(45px * var(--corner-scale, 1));
}`;
