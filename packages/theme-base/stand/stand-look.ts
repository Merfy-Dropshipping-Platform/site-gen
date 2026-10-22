// Режим «как тема» для стендов расширений (спека 120, этап 5).
// ?look=<тема> — стенд включает токены темы (defaults и colorSchemes[0] из
// packages/theme-<тема>/theme.json) и data-look='theme': форма и записи
// рисуются в дизайн-системе темы, как на витрине. Без параметра стенд
// прежний — палитра прототипа PM.
import roseTheme from '../../theme-rose/theme.json';
import satinTheme from '../../theme-satin/theme.json';
import bloomTheme from '../../theme-bloom/theme.json';
import vanillaTheme from '../../theme-vanilla/theme.json';

interface ThemeManifestShape {
  defaults?: Record<string, string>;
  colorSchemes?: Array<{ tokens: Record<string, string> }>;
  fonts?: Array<{ family: string; weights?: number[] }>;
}

const THEMES: Readonly<Record<string, ThemeManifestShape>> = {
  rose: roseTheme,
  satin: satinTheme,
  bloom: bloomTheme,
  vanilla: vanillaTheme,
};

const tokenLines = (tokens: Record<string, string>): string =>
  Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');

/** CSS токенов одной темы: defaults в :root, схема 1 — в цветовом классе. */
export const themeTokensCss = (theme: string): string | null => {
  const manifest = THEMES[theme];
  if (manifest === undefined) return null;
  const scheme = manifest.colorSchemes?.[0]?.tokens ?? {};
  return `:root { ${tokenLines(manifest.defaults ?? {})} }
.look-${theme} { ${tokenLines(scheme)} }
body.look-${theme}-bg { background: rgb(var(--color-bg)); }`;
};

/** Google Fonts по families из манифеста темы (weights 400 и 700). */
export const themeFontsHref = (theme: string): string => {
  const families = THEMES[theme]?.fonts?.map((font) => font.family) ?? [];
  const family = (name: string) =>
    name.replace(/ /g, '+') + ':wght@400;700';
  const query = families.map(family).join('&family=');
  return `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
};

// Обратная совместимость: строка токенов vanilla, как до обобщения.
export const VANILLA_TOKENS_CSS = themeTokensCss('vanilla') ?? '';
export const VANILLA_FONTS_HREF = themeFontsHref('vanilla');

/** Включить режим: токены, шрифты, цветовой класс и data-look на стенде. */
export function applyStandLook(root: HTMLElement): boolean {
  const theme = new URLSearchParams(window.location.search).get('look');
  if (theme === null || THEMES[theme] === undefined) return false;
  const css = themeTokensCss(theme);
  if (css === null) return false;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = themeFontsHref(theme);
  document.head.appendChild(fonts);
  document.body.classList.add(`look-${theme}-bg`);
  root.classList.add(`look-${theme}`);
  root.dataset.look = 'theme';
  return true;
}
