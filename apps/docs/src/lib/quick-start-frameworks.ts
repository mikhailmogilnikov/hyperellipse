import type { CodeTab } from "./highlight";

const astroRegisterCode = [
  "---",
  "// Layout.astro",
  "---",
  "",
  "<script>",
  '  import { registerHyperellipse } from "hyperellipse";',
  "",
  "  registerHyperellipse();",
  "</script>",
].join("\n");

export const frameworkTabs: CodeTab[] = [
  {
    code: `'use client';
    
import { useEffect } from "react";
import { registerHyperellipse } from "hyperellipse";

export default function App() {
  useEffect(() => {
    registerHyperellipse();
  }, []);

  return <main>...</main>;
}`,
    id: "react",
    label: "React",
    lang: "tsx",
  },
  {
    code: `<!-- App.vue -->
<script setup>
import { onMounted } from "vue";
import { registerHyperellipse } from "hyperellipse";

onMounted(() => {
  registerHyperellipse();
});
</script>`,
    id: "vue",
    label: "Vue",
    lang: "vue",
  },
  {
    code: `<!-- +layout.svelte -->
<script>
  import { onMount } from "svelte";
  import { registerHyperellipse } from "hyperellipse";

  onMount(() => {
    registerHyperellipse();
  });
</script>`,
    id: "svelte",
    label: "Svelte",
    lang: "svelte",
  },
  {
    code: astroRegisterCode,
    id: "astro",
    label: "Astro",
    lang: "astro",
  },
  {
    code: `// main.ts
import { registerHyperellipse } from "hyperellipse";

registerHyperellipse();`,
    id: "vanilla",
    label: "Vanilla",
    lang: "typescript",
  },
];

export const stylingCode = `.button {
  --corner-shape: squircle;
  border-radius: 45px;
}`;

export const ssrFallbackCode = `@supports not (corner-shape: squircle) {
  :root {
    --corner-scale: 0.6;
  }
}

/* or @import "hyperellipse/css"; */

.button {
  --corner-shape: squircle;
  border-radius: calc(45px * var(--corner-scale, 1));
}`;
