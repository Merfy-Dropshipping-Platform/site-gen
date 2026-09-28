/**
 * «Стиль кнопки» в «Мультирядах» действительно меняет кнопку — во всех пяти
 * темах.
 *
 * Откуда задача. Таблица тестера 18.09, строка «„Стиль кнопки“ (Основная /
 * Дополнительная) — кнопка всегда на токенах `color-button-bg`».
 *
 * ЗАМЕР ДО (20.09, локальный рендер тех же скомпилированных модулей, что уходят
 * на витрину, `dist/theme-sections/<тема>`, живая цепочка):
 *
 *   тема     «Основная»                    «Дополнительная»              итог
 *   rose     button-bg / button-text       button-2-bg / button-2-text   ок
 *   satin    прозрачная / button-2-text    button-2-bg / button-2-text   ок
 *   bloom    button-bg / button-text       button-bg / button-text       МЕРТВО
 *   flux     button-2-bg / button-2-text   button-2-bg / button-2-text   МЕРТВО
 *   vanilla  button-bg / button-text       button-bg / button-text       МЕРТВО
 *
 * ПРИЧИНА — расхождение словарей. Панель отдаёт ровно два значения, `primary` и
 * `secondary` (`MultiRows.puckConfig.ts`, подписи «Основная» / «Дополнительная»),
 * а порты тем ветвились по словарю верстальщиков: `white`, `black`, `outlined`,
 * `solid`. Ветки с такими литералами не срабатывали никогда, и выбор мерчанта
 * проваливался в основную кнопку. Ветку `secondary` имели только rose (через
 * `normalizeRoseMultiRowsButtonStyle`) и satin.
 *
 * Легаси-слова НЕ удалены намеренно: замер живого стенда показал, что они
 * доезжают до порта СЫРЫМИ (`buttonStyle: 'white'` на bloom дал вторичные
 * токены, `'outlined'` — прозрачную с бордером). Общая нормализация
 * `resolveMultiRowsButtonStyle` на этом пути не применяется, поэтому выкинуть
 * старые литералы — значит поменять вид у магазинов, чьи ревизии их хранят.
 *
 * ЧТО СТОРОЖИМ. «Основная» и «Дополнительная» обязаны дать РАЗНЫЕ роли схемы
 * в каждой теме (25.09: роль красит кнопку единым правилом, scheme-buttons.ts;
 * что роль реально красит фон/текст/рамку, меряет scheme-button-roles.spec.ts).
 * Предыдущий класс багов ровно в том и состоял, что разметка валидна, гарды
 * зелёные, а настройка мертва.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
type Theme = (typeof THEMES)[number];

type Job = { block: string; props: Record<string, unknown>; live: true };
type Row = { block: string; html?: string; error?: string };

const row = {
  id: 'row-1',
  title: 'Ряд',
  description: 'Текст ряда',
  image: '/images/x.jpg',
  button: { text: 'Кнопка', link: '/catalog' },
};

const job = (buttonStyle: string): Job => ({
  block: 'MultiRows',
  props: { id: 'MultiRows-1', buttonStyle, rows: [row] },
  live: true,
});

/** Порядок важен — на него ссылаются индексы ниже. */
const JOBS: Job[] = [
  job('primary'), // 0 — «Основная»
  job('secondary'), // 1 — «Дополнительная»
  job('white'), // 2 — легаси из старых ревизий
];

/**
 * Роль ССЫЛКИ-кнопки ряда (`data-scheme-button`).
 *
 * С 25.09 цвета кнопки даёт правило роли схемы (src/themes/scheme-buttons.ts):
 * порт только называет роль, классы у «Основной» и «Дополнительной» одинаковые.
 * Поэтому сторожим роль, а нарисованные цвета — scheme-button-roles.spec.ts.
 *
 * Берём тег `<a href="/catalog">` целиком: атрибуты и текст кнопки стоят
 * на разных строках, поэтому наивное `<a[^>]*>Кнопка` не находит ничего и тест
 * «зеленеет» на пустоте — на этом зонд уже один раз обманул (первая версия
 * показала «мертво» во всех пяти темах, включая заведомо рабочие rose и satin).
 */
const buttonRole = (html: string | undefined): string | null => {
  const tag = (html ?? '').match(/<a[^>]*href="\/catalog"[^>]*>/s);
  if (!tag) return null;
  const role = tag[0].match(/data-scheme-button="([^"]*)"/);
  return role ? role[1] : null;
};

const built = (theme: Theme) =>
  existsSync(resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json'));

describe.each(THEMES)('«Мультиряды»: стиль кнопки — %s', (theme) => {
  const isBuilt = built(theme);
  let rendered: Row[] = [];

  beforeAll(() => {
    if (!isBuilt) return;
    const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(JOBS)], {
      cwd: SITES_ROOT,
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
    });
    rendered = JSON.parse(raw) as Row[];
  }, 300_000);

  it('секции темы собраны — иначе проверки ниже ничего не сторожат', () => {
    expect(isBuilt).toBe(true);
  });

  it('САБОТАЖ-ОПОРА: кнопка вообще нарисована и её класс найден', () => {
    if (!isBuilt) return;
    // Без этой опоры зонд, разучившийся находить кнопку, выдал бы «оба стиля
    // одинаковы» (оба null) — и проверка ниже упала бы по ложной причине, либо,
    // будь она написана наоборот, позеленела бы на пустоте.
    expect(rendered[0]?.error).toBeUndefined();
    expect(buttonRole(rendered[0]?.html)).toBeTruthy();
    expect(buttonRole(rendered[1]?.html)).toBeTruthy();
  });

  it('«Основная» и «Дополнительная» дают РАЗНЫЕ роли схемы', () => {
    if (!isBuilt) return;
    expect(buttonRole(rendered[0]?.html)).toBe('primary');
    expect(buttonRole(rendered[1]?.html)).toBe('secondary');
  });

  it('легаси-значение из старых ревизий по-прежнему рисует вторичную кнопку', () => {
    if (!isBuilt) return;
    // `white` доезжает до порта сырым (общая нормализация на этом пути не
    // работает). Выкинуть литерал — поменять вид живым магазинам.
    expect(buttonRole(rendered[2]?.html)).toBe(buttonRole(rendered[1]?.html));
  });
});
