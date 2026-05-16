/**
 * Shared placeholder SVG-illustrations для Astro блоков theme-base.
 * Стиль: blue flat illustrations Yandex Kit / Figma 1:19336 (section previews).
 *
 * Использование: каждый блок импортирует нужный placeholder и рендерит
 * через <Fragment set:html={PLACEHOLDER}> когда нет реальных данных.
 *
 * Палитра наследуется от текущей color-scheme через CSS-vars
 * (--color-accent для синего, --color-surface для bg, --color-text/0.2 для shapes).
 */

// Свитер — для product/collection placeholders (Figma 1:19341 — 4 свитера).
// fill="currentColor" — берёт через CSS-var нужный оттенок.
export const PLACEHOLDER_SWEATER = `<svg preserveAspectRatio="xMidYMid meet" width="100%" height="100%" viewBox="0 0 80 80" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="display:block" aria-hidden="true"><g><path d="M4.57 68.57C4.11 66.29 4 61.71 4 61.71H14.29V70.86H6.86C6.86 70.86 5.03 70.86 4.57 68.57Z" fill-opacity="0.55"/><path d="M10.29 5.71C12 2.29 24 0 24 0H35.43V77.71C35.43 80 33.14 80 33.14 80H16C16 80 14.29 80 14.29 77.71L14.29 61.71H4C4 61.71 0 40 0 34.86C0 29.71 8.57 9.14 10.29 5.71Z" fill-opacity="0.85"/><path d="M69.71 5.71C68 2.29 56 0 56 0H44.57V77.71C44.57 80 46.86 80 46.86 80H64C64 80 65.71 80 65.71 77.71V61.71H76C76 61.71 80 40 80 34.86C80 29.71 71.43 9.14 69.71 5.71Z" fill-opacity="0.85"/><path d="M40 75.43V0L24 0C24 0 24.03 1.71 24.57 8C25.12 14.29 35.43 18.29 35.43 18.29V75.43H40Z" fill-opacity="0.55"/><path d="M40 75.43V0H56C56 0 55.97 1.71 55.43 8C54.88 14.29 44.57 18.29 44.57 18.29V75.43H40Z" fill-opacity="1"/><path d="M14.29 68.8V70.86L14.29 74.86L25.14 63.43L27.16 61.16C28.15 60.04 27.36 58.29 25.87 58.29C25.41 58.29 24.96 58.47 24.63 58.81L21.14 62.4L14.86 68.8H14.29Z" fill-opacity="0.55"/><path d="M65.71 68.8V70.86V74.86L54.86 63.43L52.84 61.16C51.85 60.04 52.64 58.29 54.13 58.29C54.59 58.29 55.04 58.47 55.37 58.81L58.86 62.4L65.14 68.8H65.71Z" fill-opacity="1"/><path d="M75.43 68.57C75.43 66.29 76 61.71 76 61.71H65.71V70.86H73.71C73.71 70.86 75.43 70.86 75.43 68.57Z" fill-opacity="1"/></g></svg>`;

// Landscape illustration — для media-placeholder в Video / Slideshow / Image /
// Hero / ImageWithText / MultiRows. Stylized building/landscape в стиле Figma
// 1:19425 (slideshow), 1:19413 (image), 1:19525 (video).
export const PLACEHOLDER_LANDSCAPE = `<svg preserveAspectRatio="xMidYMid slice" width="100%" height="100%" viewBox="0 0 320 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="display:block" aria-hidden="true">
  <rect width="320" height="200" fill="currentColor" fill-opacity="0.08"/>
  <path d="M0 200 L0 130 L60 110 L100 140 L160 100 L210 130 L270 90 L320 120 L320 200 Z" fill="currentColor" fill-opacity="0.35"/>
  <path d="M0 200 L0 160 L40 150 L80 170 L130 145 L180 165 L230 140 L280 160 L320 150 L320 200 Z" fill="currentColor" fill-opacity="0.6"/>
  <rect x="200" y="60" width="60" height="50" fill="currentColor" fill-opacity="0.45"/>
  <rect x="208" y="68" width="10" height="14" fill="currentColor" fill-opacity="0.85"/>
  <rect x="225" y="68" width="10" height="14" fill="currentColor" fill-opacity="0.85"/>
  <rect x="242" y="68" width="10" height="14" fill="currentColor" fill-opacity="0.85"/>
  <rect x="208" y="88" width="10" height="14" fill="currentColor" fill-opacity="0.85"/>
  <rect x="225" y="88" width="10" height="14" fill="currentColor" fill-opacity="0.85"/>
  <rect x="242" y="88" width="10" height="14" fill="currentColor" fill-opacity="0.85"/>
  <circle cx="50" cy="40" r="14" fill="currentColor" fill-opacity="0.7"/>
</svg>`;

// Play-icon — overlay для Video placeholder.
export const PLACEHOLDER_PLAY = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="currentColor" fill-opacity="0.9"/><path d="M26 22L42 32L26 42V22Z" fill="white"/></svg>`;

// Photo-icon — для empty image slots (Gallery / Publications cards).
export const PLACEHOLDER_PHOTO = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>`;

// Document/stack — для Page embed placeholder.
export const PLACEHOLDER_DOC = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><polyline points="2 15.5 12 22 22 15.5"/><polyline points="2 12 12 18.5 22 12"/></svg>`;
