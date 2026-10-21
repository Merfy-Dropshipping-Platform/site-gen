// Режим «как тема» для стендов расширений (спека 120, этап 5 на vanilla).
// ?look=vanilla — стенд включает токены vanilla (defaults и colorSchemes[0]
// из packages/theme-vanilla/theme.json) и data-look="theme": форма и записи
// рисуются в дизайн-системе vanilla, как на витрине. Без параметра стенд
// прежний — палитра прототипа PM.
import vanillaTheme from "../../theme-vanilla/theme.json";

const scheme = vanillaTheme.colorSchemes[0]?.tokens ?? {};

const tokenLines = (tokens: Record<string, string>): string =>
  Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");

// defaults — шрифты, веса и радиусы; схема 1 — цвета тройками RGB.
export const VANILLA_TOKENS_CSS = `:root { ${tokenLines(vanillaTheme.defaults ?? {})} }
.look-vanilla { ${tokenLines(scheme)} }
body.look-vanilla-bg { background: rgb(var(--color-bg)); }`;

// Шрифты vanilla (defaults: Bitter — заголовки, Arsenal — текст).
export const VANILLA_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Arsenal:wght@400;700&family=Bitter:wght@400;700&display=swap";

/** Включить режим: токены, шрифты, цветовой класс и data-look на стенде. */
export function applyStandLook(root: HTMLElement): boolean {
  if (new URLSearchParams(window.location.search).get("look") !== "vanilla")
    return false;
  const style = document.createElement("style");
  style.textContent = VANILLA_TOKENS_CSS;
  document.head.appendChild(style);
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href = VANILLA_FONTS_HREF;
  document.head.appendChild(fonts);
  document.body.classList.add("look-vanilla-bg");
  root.classList.add("look-vanilla");
  root.dataset.look = "theme";
  return true;
}
