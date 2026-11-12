// Раскадровка без браузера: HTML режима витрины и группировка анимаций (`look-motion.ts`).
import { describe, expect, it } from 'vitest';
import { groupAnimations, motionHtmlOf, type MotionRow } from '../src/look/look-motion';

const config = (patch: Record<string, unknown> = {}, page = 'home') =>
  JSON.stringify({
    v: 1,
    mode: 'preview',
    shop: { id: 's1', name: 'Магазин', url: 'https://shop.example.ru' },
    analytics: null,
    page: { id: page, path: '/' },
    theme: { id: 'nova', settings: { note: '</script>' } },
    ...patch,
  });

// Как печатает сборка: `<` в JSON экранирован, иначе `</script>` из настроек оборвал бы тег.
const pageOf = (json: string, htmlAttributes = ' lang="ru"') =>
  `<!doctype html><html${htmlAttributes}><head><script id="merfy-config" type="application/json">${json.replace(/</g, '\\u003c')}</script></head><body></body></html>`;

describe('HTML режима витрины', () => {
  it('конфиг — live, появления включены принудительно, если у магазина их нет', () => {
    const result = motionHtmlOf(pageOf(config()));
    if (!result.ok) throw new Error(result.reason);
    expect(result.revealForced).toBe(true);
    expect(result.html).toContain('<html lang="ru" data-motion-reveal="on">');
    const raw = /id="merfy-config"[^>]*>([\s\S]*?)<\/script>/.exec(result.html)?.[1] ?? '';
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toMatchObject({ mode: 'live', analytics: null, page: { id: 'home' } });
    // `</script>` из настроек темы не закрывает тег конфига.
    expect(raw).not.toContain('</script');
    expect(parsed).toMatchObject({ theme: { settings: { note: '</script>' } } });
  });

  it('появления выключены (off) — переписываются на on и считаются принудительными', () => {
    const result = motionHtmlOf(pageOf(config(), ' lang="ru" data-motion-reveal="off" data-card-style="soft"'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.revealForced).toBe(true);
    expect(result.html).toContain('data-motion-reveal="on"');
    expect(result.html).not.toContain('data-motion-reveal="off"');
    expect(result.html).toContain('data-card-style="soft"');
  });

  it('появления уже включены — не принудительно', () => {
    const result = motionHtmlOf(pageOf(config(), ' data-motion-reveal="on"'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.revealForced).toBe(false);
  });

  it('отказы: нет конфига, конфиг не по форме, страница кабинета', () => {
    expect(motionHtmlOf('<html><body></body></html>')).toMatchObject({ ok: false });
    expect(motionHtmlOf(pageOf('{не json'))).toMatchObject({ ok: false });
    expect(motionHtmlOf(pageOf('{"v":1}'))).toMatchObject({ ok: false });
    const cabinet = motionHtmlOf(pageOf(config({}, 'page-orders')));
    expect(cabinet).toMatchObject({ ok: false });
    if (cabinet.ok) throw new Error('кабинет должен отказать');
    expect(cabinet.reason).toContain('кабинет');
  });
});

describe('список анимаций страницы', () => {
  const row = (patch: Partial<MotionRow>): MotionRow => ({
    section: 'hero-1',
    type: 'hero',
    preset: 'fade-up',
    duration: 600,
    delay: 0,
    loop: false,
    node: 0,
    ...patch,
  });

  it('одинаковые пресеты секции склеиваются: сколько элементов и разброс задержек', () => {
    const grouped = groupAnimations([
      row({ delay: 0, node: 0 }),
      row({ delay: 120, node: 1 }),
      row({ delay: 240, node: 2 }),
      row({ preset: null, duration: 300, node: 3 }),
    ]);
    expect(grouped).toEqual([
      {
        section: 'hero-1',
        type: 'hero',
        preset: 'fade-up',
        durationMs: 600,
        delayMs: 0,
        spanMs: 240,
        elements: 3,
        loop: false,
      },
      {
        section: 'hero-1',
        type: 'hero',
        preset: null,
        durationMs: 300,
        delayMs: 0,
        spanMs: 0,
        elements: 1,
        loop: false,
      },
    ]);
  });

  it('по анимации на свойство (прозрачность, сдвиг) считаются как один элемент', () => {
    const grouped = groupAnimations([row({ node: 0 }), row({ node: 0 }), row({ node: 1 }), row({ node: 1 })]);
    expect(grouped.map((entry) => entry.elements)).toEqual([2]);
  });

  it('разные секции и бесконечные анимации — отдельные строки', () => {
    const grouped = groupAnimations([
      row({}),
      row({ section: 'gallery-2', type: 'gallery' }),
      row({ loop: true, duration: 2000 }),
    ]);
    expect(grouped.map((entry) => [entry.section, entry.loop])).toEqual([
      ['hero-1', false],
      ['gallery-2', false],
      ['hero-1', true],
    ]);
  });
});
