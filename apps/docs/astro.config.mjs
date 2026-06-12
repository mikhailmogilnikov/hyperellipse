// @ts-check

import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://hyperellipse.vercel.app",
  integrations: [sitemap()],
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
