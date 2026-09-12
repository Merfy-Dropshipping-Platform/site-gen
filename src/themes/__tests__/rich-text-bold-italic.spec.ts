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

import { inlineFormat as rose } from '../../../themes/rose/src/lib/rich-text';
import { inlineFormat as bloom } from '../../../themes/bloom/src/lib/rich-text';
import { inlineFormat as satin } from '../../../themes/satin/src/lib/rich-text';

/**
 * Три порта с собственной копией хелпера (flux и vanilla своего пока не имеют —
 * там начертания экранируются целиком, см. отчёт по багу).
 */
const PORTS: Array<[string, (v: unknown) => string]> = [
  ['rose', rose],
  ['bloom', bloom],
  ['satin', satin],
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
