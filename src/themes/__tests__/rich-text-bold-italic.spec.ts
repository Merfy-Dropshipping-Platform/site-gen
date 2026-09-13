/**
 * Жирный И курсив вместе — баг-репорт тестера 2026-09-13:
 * «Баг жирность и курсив. Во всех секциях и параметрах выдаёт ошибки.
 *  Должны спокойно работать как по отдельности, так и вместе».
 *
 * Причина: конструктор до `f19bb5f` умел обернуть поле РОВНО одним тегом —
 * второе начертание затирало первое. После фикса он пишет вложенную пару
 * `<strong><em>ТЕКСТ</em></strong>`, а `inlineFormat` портов тем умеет снимать
 * только ОДНУ обёртку: внутренний тег уезжал в `escapeHtml` и мерчант видел на
 * витрине и в превью сырьё «<em>ТЕКСТ</em>» внутри жирного.
 *
 * Пруф на проде (rose, 2026-09-13):
 *   POST /api/sites/<id>/preview/block {blockType:'Hero', props:{title:'<strong><em>ТЕКСТ</em></strong>'}}
 *   → <h1 …><strong>&lt;em&gt;ТЕКСТ&lt;/em&gt;</strong></h1>
 *
 * Здесь фиксируем контракт: снимаем ЛЮБУЮ вложенность разрешённых инлайн-тегов
 * без атрибутов, всё остальное по-прежнему экранируем (stored XSS мерчанта в
 * адрес его покупателей не исполняется).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { inlineFormat as rose } from '../../../themes/rose/src/lib/rich-text';
import { inlineFormat as bloom } from '../../../themes/bloom/src/lib/rich-text';
import { inlineFormat as satin } from '../../../themes/satin/src/lib/rich-text';
import { inlineFormat as flux } from '../../../themes/flux/src/lib/rich-text';
import { inlineFormat as vanilla } from '../../../themes/vanilla/src/lib/rich-text';

/**
 * Все пять портов держат СВОЮ копию хелпера (тема не тянет чужую тему). Копии
 * обязаны совпадать телом — иначе «починили в одной, забыли в четырёх»; это
 * проверяет отдельный тест ниже.
 */
const PORTS: Array<[string, (v: unknown) => string]> = [
  ['rose', rose],
  ['bloom', bloom],
  ['satin', satin],
  ['flux', flux],
  ['vanilla', vanilla],
];

describe.each(PORTS)('%s — inlineFormat', (_name, inlineFormat) => {
  it('оставляет чистый текст как есть', () => {
    expect(inlineFormat('ТЕКСТ')).toBe('ТЕКСТ');
  });

  it('жирный по отдельности', () => {
    expect(inlineFormat('<strong>ТЕКСТ</strong>')).toBe('<strong>ТЕКСТ</strong>');
  });

  it('курсив по отдельности', () => {
    expect(inlineFormat('<em>ТЕКСТ</em>')).toBe('<em>ТЕКСТ</em>');
  });

  it('жирный + курсив вместе (порядок конструктора)', () => {
    expect(inlineFormat('<strong><em>ТЕКСТ</em></strong>')).toBe(
      '<strong><em>ТЕКСТ</em></strong>',
    );
  });

  it('жирный + курсив вместе (обратный порядок — легаси-ревизии)', () => {
    expect(inlineFormat('<em><strong>ТЕКСТ</strong></em>')).toBe(
      '<em><strong>ТЕКСТ</strong></em>',
    );
  });

  it('легаси-теги b/i вместе', () => {
    expect(inlineFormat('<b><i>ТЕКСТ</i></b>')).toBe('<b><i>ТЕКСТ</i></b>');
  });

  it('пустое значение и не-строка', () => {
    expect(inlineFormat('')).toBe('');
    expect(inlineFormat(null)).toBe('');
    expect(inlineFormat(undefined)).toBe('');
    expect(inlineFormat(42)).toBe('');
  });

  it('пустая обёртка не ломается', () => {
    expect(inlineFormat('<strong></strong>')).toBe('<strong></strong>');
  });

  // --- XSS: всё, что не «обёртка всего значения разрешённым тегом», экранируем.

  it('скрипт внутри начертания экранируется', () => {
    expect(inlineFormat('<strong><script>alert(1)</script></strong>')).toBe(
      '<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>',
    );
  });

  it('скрипт снаружи экранируется', () => {
    expect(inlineFormat('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('img c onerror внутри двойного начертания экранируется', () => {
    expect(inlineFormat('<strong><em><img src=x onerror=alert(1)></em></strong>')).toBe(
      '<strong><em>&lt;img src=x onerror=alert(1)&gt;</em></strong>',
    );
  });

  it('атрибуты на разрешённом теге не проходят', () => {
    expect(inlineFormat('<strong onmouseover="alert(1)">ТЕКСТ</strong>')).toBe(
      '&lt;strong onmouseover=&quot;alert(1)&quot;&gt;ТЕКСТ&lt;/strong&gt;',
    );
  });

  it('неразрешённый тег снаружи экранируется целиком', () => {
    expect(inlineFormat('<div><strong>ТЕКСТ</strong></div>')).toBe(
      '&lt;div&gt;&lt;strong&gt;ТЕКСТ&lt;/strong&gt;&lt;/div&gt;',
    );
  });

  it('незакрытый внутренний тег не превращается в разметку', () => {
    // Внешняя пара валидна, внутри мусор — мусор экранируется, дыры нет.
    expect(inlineFormat('<strong><em>ТЕКСТ</strong>')).toBe(
      '<strong>&lt;em&gt;ТЕКСТ</strong>',
    );
  });

  it('амперсанд и кавычки в тексте экранируются', () => {
    expect(inlineFormat('<strong>Иванов & сыновья "1998"</strong>')).toBe(
      '<strong>Иванов &amp; сыновья &quot;1998&quot;</strong>',
    );
  });
});

/**
 * Копии хелпера должны быть идентичны телом (отличается только комментарий-
 * шапка). Иначе XSS-правка в одной копии молча минует остальные — ровно тот
 * класс багов, из-за которого тестер видит фичу «на одном пути из трёх».
 *
 * ⚠️ Копий БОЛЬШЕ ПЯТИ. Кроме `themes/<t>/src/lib/rich-text.ts` свою копию
 * держит блок «Каталог» каждого пакета темы (`packages/theme-<t>/blocks/
 * Catalog/rich-text.ts`): импортировать `../../lib/rich-text` оттуда нельзя —
 * компилятор секций переписывает только `../../runtime/*`, а сборщик витрины
 * кладёт файлы блока плоско в `<scaffold>/src/components/`.
 *
 * 13.09 выяснилось, что копии bloom и satin ОТСТАЛИ: они снимали РОВНО ОДНУ
 * обёртку, и «жирный + курсив вместе» печатал в заголовке каталога сырьё
 * «<em>ТЕКСТ</em>» внутри жирного. Тот же откат, что чинили в `f19bb5f`, —
 * просто в копиях, которых не сторожил никто, потому что список копий был
 * прибит гвоздями к пяти темам. Поэтому копии теперь ИЩУТСЯ, а не
 * перечисляются: новая копия попадает под сторож сама.
 */
describe('копии inlineFormat по репозиторию', () => {
  const SRC_ROOT = resolve(__dirname, '..', '..', '..');
  const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'e2e', 'conformance-results']);

  /** Все файлы `rich-text.ts`, экспортирующие `inlineFormat`. */
  function findCopies(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        findCopies(full, acc);
      } else if (entry === 'rich-text.ts') {
        if (readFileSync(full, 'utf-8').includes('export function inlineFormat')) acc.push(full);
      }
    }
    return acc;
  }

  const copies = [
    ...findCopies(resolve(SRC_ROOT, 'themes')),
    ...findCopies(resolve(SRC_ROOT, 'packages')),
  ].sort();

  /** Тело = всё начиная с первого объявления; выше только комментарий-шапка. */
  const bodyOf = (file: string) => {
    const src = readFileSync(file, 'utf-8');
    const start = src.indexOf('/** Начертания');
    expect(start).toBeGreaterThan(-1);
    return src.slice(start);
  };

  it('копий найдено не меньше, чем тем (сторож самого поиска)', () => {
    // Пять тем + пять блоков «Каталог». Меньше — значит поиск сломался и
    // сравнивать нечего, а тест бы «прошёл».
    expect(copies.length).toBeGreaterThanOrEqual(10);
  });

  it('тело хелпера побайтово одинаково во ВСЕХ копиях', () => {
    // Эталон — БОЛЬШИНСТВО, а не первая по алфавиту копия: иначе одна отставшая
    // копия объявляет «разъехавшимися» все остальные, и в отчёте не видно, что
    // чинить. Ровно этим отличаются устаревшие копии от новой правки.
    const bodies = new Map<string, string[]>();
    for (const f of copies) {
      const b = bodyOf(f);
      bodies.set(b, [...(bodies.get(b) ?? []), f]);
    }
    const [, majority] = [...bodies.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const drift = copies
      .filter((f) => !majority.includes(f))
      .map((f) => f.slice(SRC_ROOT.length + 1));
    expect(drift).toEqual([]);
  });

  it('копия блока «Каталог» есть у каждой из пяти тем', () => {
    for (const t of ['rose', 'bloom', 'satin', 'flux', 'vanilla']) {
      expect(copies).toContain(
        resolve(SRC_ROOT, 'packages', `theme-${t}`, 'blocks', 'Catalog', 'rich-text.ts'),
      );
    }
  });
});

/**
 * Саботаж-проверка. Если кто-то «упростит» хелпер до снятия обёрток без
 * экранирования содержимого, тесты выше на разрешённых тегах останутся зелёными.
 * Здесь ловим именно это: берём наивную реализацию (снять обёртки, остальное —
 * как есть) и убеждаемся, что она ПАДАЕТ на XSS-кейсе. Тест сторожит сам тест.
 */
describe('саботаж: наивная реализация обязана падать', () => {
  const WRAPPER = /^<(em|strong|b|i|u|s)>([\s\S]*)<\/\1>$/;

  /** Снимает обёртки, но НЕ экранирует содержимое — дыра, которую ищем. */
  function naiveFormat(value: unknown): string {
    if (typeof value !== 'string' || value === '') return '';
    let inner = value;
    const tags: string[] = [];
    while (tags.length < 4) {
      const m = inner.match(WRAPPER);
      if (!m) break;
      tags.push(m[1]);
      inner = m[2];
    }
    let out = inner;
    for (let i = tags.length - 1; i >= 0; i--) out = `<${tags[i]}>${out}</${tags[i]}>`;
    return out;
  }

  const PAYLOAD = '<strong><em>ЗЛО</em></strong><img src=x onerror=alert(1)>';

  it('наивная реализация пропускает живой <img onerror>', () => {
    // Значение целиком не является обёрткой (после </strong> идёт хвост), поэтому
    // наивная версия отдаёт payload как есть — живой тег в разметке витрины.
    expect(naiveFormat(PAYLOAD)).toContain('<img src=x onerror=alert(1)>');
  });

  it.each(PORTS)('%s — настоящая реализация НЕ пропускает', (_name, inlineFormat) => {
    const out = inlineFormat(PAYLOAD);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror=alert(1)>');
    expect(out).toBe(
      '&lt;strong&gt;&lt;em&gt;ЗЛО&lt;/em&gt;&lt;/strong&gt;&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it.each(PORTS)('%s — вложенное начертание + хвост со скриптом', (_name, inlineFormat) => {
    const out = inlineFormat('<strong><em>ЗЛО</em><script>alert(1)</script></strong>');
    expect(out).not.toContain('<script');
    expect(out).toBe(
      '<strong>&lt;em&gt;ЗЛО&lt;/em&gt;&lt;script&gt;alert(1)&lt;/script&gt;</strong>',
    );
  });
});
