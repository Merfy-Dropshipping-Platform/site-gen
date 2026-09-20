import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Баг тестера из таблицы (18.09): «„Видео“ → „Положение видео“ (На весь
 * экран/Окно): HTML секции побайтово одинаков, обёртка всегда max-w-[1280px]».
 *
 * Причина: рядом с видимым полем `position` есть скрытое `align`, и рендер
 * считал его ПРИОРИТЕТНЕЕ — `alignProp ? alignProp === 'fullbleed' : …`. А в
 * `theme.json` у bloom, satin и vanilla стоит `blockDefaults.Video.align =
 * "container"`, то есть скрытый дефолт темы намертво перекрывал выбор мерчанта.
 *
 * Правило: видимое поле главнее. `align` решает только когда `position` в
 * данных секции нет вовсе.
 */
const ROOT = join(__dirname, '..', '..', '..');
const THEMES = ['flux', 'bloom', 'satin', 'vanilla'] as const;

describe('«Положение видео» решает, а не скрытый align', () => {
  /** Формула, вычисляющая полноэкранность: position должен идти ПЕРВЫМ. */
  const positionWinsIn = (formula: string): boolean => {
    const flat = formula.replace(/\s+/g, ' ');
    const posAt = flat.search(/position/i);
    const alignAt = flat.search(/align/i);
    return posAt >= 0 && (alignAt < 0 || posAt < alignAt);
  };

  it('общий блок: position главнее align', () => {
    const src = readFileSync(join(__dirname, '..', 'blocks', 'Video', 'Video.astro'), 'utf8');
    const i = src.indexOf('const containerClass');
    expect(i).toBeGreaterThan(-1);
    expect(positionWinsIn(src.slice(i, src.indexOf(';', i)))).toBe(true);
  });

  it.each(THEMES)('%s: порт отдаёт приоритет видимому полю', (theme) => {
    const p = join(ROOT, 'themes', theme, 'src', 'components', 'sections', 'Video.astro');
    if (!existsSync(p)) return;
    const src = readFileSync(p, 'utf8');
    const i = src.indexOf('const fullBleed');
    expect(i).toBeGreaterThan(-1);
    expect(positionWinsIn(src.slice(i, src.indexOf(';', i)))).toBe(true);
  });
});
