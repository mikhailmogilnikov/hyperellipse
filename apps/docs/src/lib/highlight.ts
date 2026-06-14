import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import astro from "shiki/langs/astro.mjs";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import shell from "shiki/langs/shellscript.mjs";
import svelte from "shiki/langs/svelte.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import vue from "shiki/langs/vue.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";

export type HighlightLanguage =
  | "astro"
  | "css"
  | "html"
  | "shell"
  | "svelte"
  | "tsx"
  | "typescript"
  | "vue";

export interface CodeTab {
  code: string;
  id: string;
  label: string;
  lang: HighlightLanguage;
}

let highlighterPromise: Promise<HighlighterCore> | undefined;

const getHighlighter = () => {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [astro, css, html, shell, svelte, tsx, typescript, vue],
    themes: [githubLight, githubDark],
  });

  return highlighterPromise;
};

export const highlightCode = async (code: string, lang: HighlightLanguage) => {
  const instance = await getHighlighter();

  return instance.codeToHtml(code.trim(), {
    defaultColor: false,
    lang,
    themes: {
      dark: "github-dark",
      light: "github-light",
    },
  });
};
