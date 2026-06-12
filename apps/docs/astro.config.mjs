// @ts-check

import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  fonts: [
    {
      cssVariable: "--font-geist",
      name: "Geist",
      provider: fontProviders.google(),
      styles: ["normal"],
      weights: [400, 500, 600, 700],
    },
    {
      cssVariable: "--font-geist-mono",
      name: "Geist Mono",
      provider: fontProviders.google(),
      styles: ["normal"],
      weights: [400, 500, 600, 700],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
