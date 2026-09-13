/**
 * Гард против возврата выдуманных публикаций.
 *
 * Пункт 7 тестировщика: секция «Публикации» показывала четыре несуществующие
 * статьи с выдуманными датами. Снимок разметки ловит это только на своей
 * фикстуре и только пока фикстура пустая; здесь — прямой запрет на литералы в
 * ИСХОДНИКАХ всех пяти тем и общего блока, чтобы «удобная болванка» не
 * вернулась через новый порт или copy-paste.
 *
 * Ловим сами фразы и — отдельно — любую русскую дату-литерал в карточке
 * («15 марта 2025» и такие же): дата, зашитая в код, всегда ложь, её источник
 * только publishedAt публикации.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

const SOURCES = [
  'packages/theme-base/blocks/Publications/Publications.astro',
  'themes/rose/src/components/sections/Publications.astro',
  'themes/bloom/src/components/sections/Publications.astro',
  'themes/satin/src/components/sections/Publications.astro',
  'themes/flux/src/components/sections/Publications.astro',
  'themes/vanilla/src/components/sections/Publications.astro',
];

const BANNED = [
  'Новая коллекция весна 2025',
  'Как ухаживать за изделиями',
  'Как ухаживать за кожаными изделиями',
  'История бренда',
  'Тренды сезона',
  'Тренды аксессуаров',
];

/** «15 марта 2025» и любая другая зашитая русская дата. */
const HARDCODED_DATE =
  /["'`]\s*\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*["'`]/;

describe('в «Публикациях» нет выдуманных записей', () => {
  for (const rel of SOURCES) {
    const abs = resolve(SITES_ROOT, rel);
    const present = existsSync(abs);

    it(`${rel} — без заголовков-фантомов`, () => {
      if (!present) return; // у темы может не быть своего порта (rose)
      const src = readFileSync(abs, 'utf-8');
      // Комментарии не считаем кодом, но и там литералов держать незачем.
      for (const phrase of BANNED) {
        expect(src).not.toContain(phrase);
      }
    });

    it(`${rel} — без зашитых дат`, () => {
      if (!present) return;
      const src = readFileSync(abs, 'utf-8');
      expect(HARDCODED_DATE.test(src)).toBe(false);
    });
  }

  it('проверка смотрит на реально существующие файлы, а не в пустоту', () => {
    const found = SOURCES.filter((rel) => existsSync(resolve(SITES_ROOT, rel)));
    // theme-base + четыре порта (у rose своего порта нет).
    expect(found.length).toBeGreaterThanOrEqual(5);
  });
});
