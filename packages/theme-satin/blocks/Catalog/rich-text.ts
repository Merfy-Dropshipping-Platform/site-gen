// XSS-safe inline rich-text для заголовков/подзаголовков блока «Каталог» темы
// satin (пакет). Тело ОБЯЗАНО совпадать с themes/*/src/lib/rich-text.ts —
// сторож: src/themes/__tests__/rich-text-bold-italic.spec.ts («все копии
// inlineFormat в репозитории»).
//
// ⚠️ ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Блок «Каталог» живёт в packages/theme-satin/blocks,
// а не в themes/satin/src, и импортировать ../../lib/rich-text оттуда нельзя:
// компилятор секций (scripts/compile-astro-blocks.mjs) переписывает только
// ../../runtime/* и ../<Блок>/<Блок>.astro, любой другой относительный путь
// уезжает наружу пакета и в dist не резолвится.
//
// ⚠️ 2026-09-13: копии bloom и satin отстали от пятёрки тем — они снимали РОВНО
// ОДНУ обёртку, и «жирный + курсив вместе» печатал в заголовке каталога сырьё
// «<em>ТЕКСТ</em>» внутри жирного. Это тот же откат, что чинили в f19bb5f, —
// просто в копиях, которых никто не сторожил. Теперь сторожит тест.

/** Начертания, которые умеет ставить конструктор (+ легаси b/i/u/s). */
const WRAPPER = /^<(em|strong|b|i|u|s)>([\s\S]*)<\/\1>$/;

/** Предел вложенности: конструктору хватает 2 (жирный+курсив), запас — на легаси. */
const MAX_DEPTH = 4;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inlineFormat(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';

  const tags: string[] = [];
  let inner = value;

  // Снимаем обёртки снаружи внутрь. Backreference `\1` гарантирует, что
  // закрывающий тег совпал с открывающим, а `<tag>` без пробела перед `>` —
  // что атрибутов (в т.ч. on*-хендлеров) в теге нет.
  while (tags.length < MAX_DEPTH) {
    const m = inner.match(WRAPPER);
    if (!m) break;
    tags.push(m[1]);
    inner = m[2];
  }

  let out = escapeHtml(inner);
  for (let i = tags.length - 1; i >= 0; i--) {
    out = `<${tags[i]}>${out}</${tags[i]}>`;
  }
  return out;
}
