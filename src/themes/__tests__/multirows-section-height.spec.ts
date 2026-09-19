/**
 * «Высота» секции «Мультиряды» правит высотой рядов, а стыки рядов не рвутся
 * скруглениями.
 *
 * Откуда задача. Владелец, 19.09 (bloom, живой конструктор): «высота настройка
 * вообще не работает» и «если отступов нет — бордер-радиусы не нужны, нужно
 * убрать эти прогалы».
 *
 * Причина первой части. У КАЖДОГО ряда в сиде лежит свой `size` (дефолт
 * панели), а порты тем читали его как приоритетный: `r.size ? r.size : p.size`.
 * Значит секционная «Высота» не меняла НИЧЕГО ни на одной из пяти тем — замер
 * через `POST /preview/block` на живом сайте владельца: секция `large` + ряды
 * `small` отдавали `aspect-[16/9]`, то есть ответ ряда. В общем блоке
 * `packages/theme-base/blocks/MultiRows/MultiRows.astro` это починили 18.09
 * правилом `perRowSizesDiffer` (одинаковые размеры у всех рядов ≡ мерчант их не
 * трогал), но в порты тем правило не доехало.
 *
 * Что сторожим:
 *  1. каждая тема учитывает `perRowSizesDiffer` — иначе «Высота» снова умрёт
 *     молча: разметка валидна, класс на месте, просто не тот;
 *  2. при РАЗНЫХ размерах рядов выбор мерчанта остаётся главнее секции;
 *  3. у bloom на ≥lg (там же, где `lg:gap-0` ставит ряды вплотную) скруглений
 *     нет — иначе между рядами снова появятся просветы подложки. Мобильные
 *     скругления при этом целы: там ряды идут с зазором.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
const portOf = (theme: string) => `themes/${theme}/src/components/sections/MultiRows.astro`;

describe('«Мультиряды»: высота секции и стыки рядов', () => {
  it.each(THEMES)('%s: секционная «Высота» не глушится дефолтным размером ряда', (theme) => {
    const src = read(portOf(theme));

    // Ряды с ОДИНАКОВЫМ размером = дефолт сида → правит секция.
    expect(src).toMatch(/const rowSizes = rawRows\.map/);
    expect(src).toMatch(/perRowSizesDiffer = rowSizes\.some/);
    // Сам выбор аспекта обязан спрашивать этот признак.
    expect(src).toMatch(/perRowSizesDiffer && r\.size/);
    // Старая безусловная ветка не вернулась.
    expect(src).not.toMatch(/\n\s*r\.size && r\.size !== "inherit" \? r\.size : p\.size/);
  });

  it('признак считается по ВСЕМ рядам, а не по первому', () => {
    // rowSizes.some(s => s !== rowSizes[0]) — любой разошедшийся ряд включает
    // per-row режим. Проверяем формулу дословно: `.some((s) => s !== rowSizes[0])`
    // легко подменить на `.every(...)`, и тогда выбор мерчанта в ОДНОМ ряду
    // потеряется, а гард выше останется зелёным.
    for (const theme of THEMES) {
      expect(read(portOf(theme))).toMatch(/rowSizes\.some\(\(s: unknown\) => s !== rowSizes\[0\]\)/);
    }
  });

  it('bloom: на ≥lg ряды идут вплотную и без скруглений', () => {
    const src = read(portOf('bloom'));

    // Ряды вплотную (канон владельца 17.09) — если зазор вернётся, снятие
    // скруглений станет бессмысленным, и проверку ниже надо пересматривать.
    expect(src).toContain('lg:gap-0');
    // Медиа и текстовый контейнер гасят скругления на той же ширине.
    expect(src).toContain('lg:rounded-none');
    // Прежние половинчатые скругления стыка не вернулись.
    expect(src).not.toContain('lg:rounded-l-[var(--radius-media,12px)]');
    expect(src).not.toContain('lg:rounded-r-[var(--radius-media,12px)]');
    expect(src).not.toContain('lg:rounded-l-[var(--radius-card,12px)]');
    expect(src).not.toContain('lg:rounded-r-[var(--radius-card,12px)]');
    // Мобильные скругления остаются: там ряды с зазором.
    expect(src).toContain('rounded-[var(--radius-media,12px)]');
  });
});
