/**
 * Скругление медиа берётся из НАСТРОЙКИ ТЕМЫ, а не из литерала в порте.
 *
 * Владелец, 20.09: «к секции не применяется настройка темы — медиа скругления».
 *
 * ЗАМЕР ДО (исходники портов + живые стенды, 20.09):
 *
 *   тема     класс скругления медиа в MultiRows   тема отдаёт --radius-media
 *   rose     rounded-[var(--radius-media,8px)]     —                 ок
 *   bloom    rounded-[var(--radius-media,12px)]    12px              ок
 *   vanilla  rounded-[var(--radius-media,0px)]     —                 ок
 *   flux     rounded-[12px]  ← ЛИТЕРАЛ             8px               МЕРТВО
 *   satin    класса нет вовсе                      0px               МЕРТВО
 *
 * То есть у flux мерчант выставлял 8px, а секция рисовала зашитые 12px; у satin
 * настройка не доходила вообще. Та же дыра была в «Изображении с текстом» тех же
 * двух тем.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ КЛАСС БАГОВ. Тут не «панель говорит не на том языке» и не
 * «скрытый дефолт перебивает» — значение попросту не спрашивают. Токен
 * доезжает до страницы (проверено на живых стендах: flux 8px, bloom 12px,
 * satin 0px), но порт рисует своё число. Снаружи неотличимо от рабочей
 * настройки, пока мерчант не подвинет ползунок.
 *
 * Фолбэк в `var(--radius-media, N)` оставлен равным прежнему литералу — тема по
 * умолчанию выглядит как раньше, меняется только поведение настройки.
 *
 * Тест читает ИСХОДНИК порта: значение токена подставляет браузер, а движок
 * каскада в наших гардах `border-radius` не разрешает (проверено — возвращает
 * null, см. `multirows-row-gap.spec.ts`). Поэтому сторожим то, что здесь и
 * ломалось: наличие ссылки на токен и отсутствие голого литерала.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
const SECTIONS = ['MultiRows', 'ImageWithText'] as const;

const portSource = (theme: string, section: string): string =>
  readFileSync(resolve(ROOT, `themes/${theme}/src/components/sections/${section}.astro`), 'utf-8');

/** Код без строчных комментариев: в них литералы упоминаются законно. */
const code = (src: string): string => src.replace(/\/\/.*$/gm, '');

describe.each(SECTIONS)('скругление медиа следует настройке темы — %s', (section) => {
  it.each(THEMES)('%s: медиа скруглено токеном --radius-media', (theme) => {
    const src = code(portSource(theme, section));
    expect(src).toMatch(/rounded-\[var\(--radius-media\s*,\s*[^)]*\)\]/);
  });

  it.each(THEMES)('%s: у медиа нет скругления голым числом', (theme) => {
    const src = code(portSource(theme, section));
    // Именно этим flux и ломался: `rounded-[12px]` рядом с aspect-классом.
    // Числа допустимы у кнопок и карточек — там свои токены со своими
    // фолбэками, поэтому запрещаем ТОЛЬКО голый литерал без var().
    const bare = src.match(/rounded-\[\d+(?:px|rem)\]/g) ?? [];
    expect({ theme, section, bare }).toEqual({ theme, section, bare: [] });
  });
});

describe('опора: файлы портов на месте и содержат медиа', () => {
  it.each(THEMES)('%s: оба порта читаются и рисуют аспект медиа', (theme) => {
    // Без этой опоры оба запрета выше зеленели бы на пустом файле.
    for (const section of SECTIONS) {
      const src = portSource(theme, section);
      expect(src.length).toBeGreaterThan(500);
      expect(src).toMatch(/aspect-/);
    }
  });
});
