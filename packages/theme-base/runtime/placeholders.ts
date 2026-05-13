/**
 * Card placeholder illustration (Figma 1:19342 «Коллекция товаров»).
 *
 * Render-only: рисуется только когда у карточки нет своего `image`.
 * Когда мерчант загрузит реальное фото — placeholder автоматически
 * исчезнет (ternary в .astro), никаких props в schema не используется.
 *
 * Один SVG-свитер, цвет через `currentColor` + `fill-opacity` —
 * соответствует theme-base правилу «no hex literals». Родитель задаёт
 * color через CSS-var темы (`color: rgb(var(--color-accent))`).
 */

const SWEATER_SVG = '<svg preserveAspectRatio="xMidYMid meet" width="100%" height="100%" viewBox="0 0 80 80" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="display:block" aria-hidden="true"><g><path d="M4.57 68.57C4.11 66.29 4 61.71 4 61.71H14.29V70.86H6.86C6.86 70.86 5.03 70.86 4.57 68.57Z" fill-opacity="0.55"/><path d="M10.29 5.71C12 2.29 24 0 24 0H35.43V77.71C35.43 80 33.14 80 33.14 80H16C16 80 14.29 80 14.29 77.71L14.29 61.71H4C4 61.71 0 40 0 34.86C0 29.71 8.57 9.14 10.29 5.71Z" fill-opacity="0.85"/><path d="M69.71 5.71C68 2.29 56 0 56 0H44.57V77.71C44.57 80 46.86 80 46.86 80H64C64 80 65.71 80 65.71 77.71V61.71H76C76 61.71 80 40 80 34.86C80 29.71 71.43 9.14 69.71 5.71Z" fill-opacity="0.85"/><path d="M40 75.43V0L24 0C24 0 24.03 1.71 24.57 8C25.12 14.29 35.43 18.29 35.43 18.29V75.43H40Z" fill-opacity="0.55"/><path d="M40 75.43V0H56C56 0 55.97 1.71 55.43 8C54.88 14.29 44.57 18.29 44.57 18.29V75.43H40Z" fill-opacity="1"/><path d="M14.29 68.8V70.86L14.29 74.86L25.14 63.43L27.16 61.16C28.15 60.04 27.36 58.29 25.87 58.29C25.41 58.29 24.96 58.47 24.63 58.81L21.14 62.4L14.86 68.8H14.29Z" fill-opacity="0.55"/><path d="M65.71 68.8V70.86V74.86L54.86 63.43L52.84 61.16C51.85 60.04 52.64 58.29 54.13 58.29C54.59 58.29 55.04 58.47 55.37 58.81L58.86 62.4L65.14 68.8H65.71Z" fill-opacity="1"/><path d="M75.43 68.57C75.43 66.29 76 61.71 76 61.71H65.71V70.86H73.71C73.71 70.86 75.43 70.86 75.43 68.57Z" fill-opacity="1"/></g></svg>';

/**
 * Inline SVG свитера. Цвет — через `color:` на родителе (SVG fill=currentColor).
 * `_index` — placeholder сейчас не варьируется по карточкам (по архитектуре
 * правильнее монохром в theme-accent), но API оставлен для будущих вариаций.
 */
export function getPlaceholderSvg(_index: number = 0): string {
  return SWEATER_SVG;
}
