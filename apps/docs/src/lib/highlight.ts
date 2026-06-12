import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import astro from "shiki/langs/astro.mjs";
import css from "shiki/langs/css.mjs";
import shell from "shiki/langs/shellscript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";

export type HighlightLanguage =
  | "astro"
  | "css"
  | "shell"
  | "tsx"
  | "typescript";

export interface CodeTab {
  code: string;
  id: string;
  label: string;
  lang: HighlightLanguage;
}

let highlighter: HighlighterCore | undefined;

const getHighlighter = async () => {
  if (!highlighter) {
    highlighter = await createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [astro, css, shell, tsx, typescript],
      themes: [githubLight, githubDark],
    });
  }

  return highlighter;
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
