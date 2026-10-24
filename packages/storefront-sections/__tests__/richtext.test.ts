import { describe, expect, it } from 'vitest';
import { RICHTEXT_MAX, sectionFieldShape, sectionSettingProblem } from '../src/fields';
import { cleanArticleHtml, cleanRichtext } from '../src/richtext';
import { resolveSectionSettings, settingsTexts } from '../src/settings';

// Вид richtext (блок 1 «Секций и SDK», часть 3, п. 4, Р52): HTML с форматированием, только у секций. Значение — строка
// до RICHTEXT_MAX знаков; перед рендером очищается по списку «Страницы» пяти тем.
const ANSWER = { id: 'answer', label: 'Ответ', setting: { kind: 'richtext' as const, default: '<p>Ответ</p>' } };
const QUESTION = { id: 'question', label: 'Вопрос', setting: { kind: 'string' as const, default: 'Новый вопрос' } };
const TOO_LONG = `answer: нужно HTML до ${RICHTEXT_MAX} знаков`;

describe('поле richtext', () => {
  it('форма: richtext с default-строкой и поля панели проходят; лишний ключ и неизвестный вид — нет', () => {
    expect(sectionFieldShape.safeParse(ANSWER).success).toBe(true);
    expect(sectionFieldShape.safeParse(QUESTION).success).toBe(true);
    expect(sectionFieldShape.safeParse({ ...ANSWER, setting: { ...ANSWER.setting, inline: true } }).success).toBe(
      false,
    );
    expect(sectionFieldShape.safeParse({ ...ANSWER, extra: 1 }).success).toBe(false);
    expect(sectionFieldShape.safeParse({ ...ANSWER, setting: { kind: 'html', default: '' } }).success).toBe(false);
  });

  it('значение: строка до RICHTEXT_MAX знаков; длиннее или не строка — текст с путём; другие виды — как у панели', () => {
    expect(sectionSettingProblem('answer', ANSWER.setting, '<p>да</p>')).toBeUndefined();
    expect(sectionSettingProblem('answer', ANSWER.setting, 'x'.repeat(RICHTEXT_MAX))).toBeUndefined();
    expect(sectionSettingProblem('answer', ANSWER.setting, 'x'.repeat(RICHTEXT_MAX + 1))).toBe(TOO_LONG);
    expect(sectionSettingProblem('answer', ANSWER.setting, true)).toBe(TOO_LONG);
    expect(sectionSettingProblem('question', QUESTION.setting, 'x'.repeat(201))).toBe(
      'question: нужно строка до 200 знаков',
    );
  });

  it('умолчание richtext в section.json проверяется', () => {
    expect(settingsTexts([ANSWER, QUESTION])).toEqual([]);
    const long = { ...ANSWER, setting: { kind: 'richtext' as const, default: 'x'.repeat(RICHTEXT_MAX + 1) } };
    expect(settingsTexts([long])).toEqual([`settings.0.default: нужно HTML до ${RICHTEXT_MAX} знаков`]);
  });
});

describe('очистка richtext', () => {
  it('теги «Страницы» остаются; script, style, iframe, обработчики и атрибуты вне списка — нет', () => {
    const html =
      '<h2 class="x" onclick="alert(1)">Доставка</h2><p>Два <strong>дня</strong></p><script>alert(1)</script>' +
      '<style>p{}</style><iframe src="https://x"></iframe><ul><li>Москва</li></ul>';
    expect(cleanRichtext(html)).toBe('<h2>Доставка</h2><p>Два <strong>дня</strong></p><ul><li>Москва</li></ul>');
    expect(cleanRichtext('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('ссылка: http(s), mailto, tel и адрес сайта; target="_blank" — с rel="noopener noreferrer"', () => {
    expect(cleanRichtext('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(cleanRichtext('<a href="//evil.example/x">x</a>')).toBe('<a>x</a>');
    expect(cleanRichtext('<a href="/catalog" onmouseover="x()">Каталог</a>')).toBe('<a href="/catalog">Каталог</a>');
    expect(cleanRichtext('<a href="https://merfy.ru" target="_blank">M</a>')).toBe(
      '<a href="https://merfy.ru" target="_blank" rel="noopener noreferrer">M</a>',
    );
    expect(cleanRichtext('<a href="tel:+79990000000" rel="opener">Позвонить</a>')).toBe(
      '<a href="tel:+79990000000">Позвонить</a>',
    );
  });
});

describe('значения экземпляра', () => {
  it('richtext очищается и в умолчании, и в правке; неверная правка — умолчание и проблема', () => {
    const dirty = { ...ANSWER, setting: { kind: 'richtext' as const, default: '<p>Ответ<script>x()</script></p>' } };
    expect(resolveSectionSettings([dirty], {})).toEqual({ values: { answer: '<p>Ответ</p>' }, invalid: [] });
    expect(resolveSectionSettings([ANSWER], { answer: '<p onclick="x()">Да</p><img src=x onerror=y>' })).toEqual({
      values: { answer: '<p>Да</p>' },
      invalid: [],
    });
    expect(resolveSectionSettings([ANSWER, QUESTION], { answer: false })).toEqual({
      values: { answer: '<p>Ответ</p>', question: 'Новый вопрос' },
      invalid: [TOO_LONG],
    });
  });
});


// Текст статьи блога (блок 8 «Секций и SDK», часть 8а): список «Записи блога» пяти тем — шире richtext.
describe('очистка текста статьи', () => {
  it('h4, картинка http(s) с alt, figure и подпись остаются; обработчики уходят', () => {
    const html =
      '<h4>Уход</h4><figure><img src="https://s3.merfy.ru/a.jpg" alt="Лён" onerror="x()"><figcaption>Лён</figcaption></figure>';
    expect(cleanArticleHtml(html)).toBe(
      '<h4>Уход</h4><figure><img src="https://s3.merfy.ru/a.jpg" alt="Лён" /><figcaption>Лён</figcaption></figure>',
    );
  });

  it('картинка javascript:, data: и без схемы — без адреса; script, style, iframe и h1 — нет', () => {
    const dangerous =
      '<img src="javascript:alert(1)"><img src="data:image/png;base64,AAA"><script>alert(1)</script><p style="color:red">Текст</p>';
    expect(cleanArticleHtml(dangerous)).toBe('<img alt="" /><img alt="" /><p>Текст</p>');
    expect(cleanArticleHtml('<img src="//evil.example/x.png" alt="x">')).toBe('<img alt="x" />');
    expect(cleanArticleHtml('<h1>Заголовок</h1><iframe src="https://x"></iframe><a href="https://merfy.ru" target="_blank">M</a>')).toBe(
      'Заголовок<a href="https://merfy.ru" target="_blank" rel="noopener noreferrer">M</a>',
    );
    expect(cleanArticleHtml('')).toBe('');
  });

  it('richtext прежний: картинки и h4 в нём нет', () => {
    expect(cleanRichtext('<img src="https://s3.merfy.ru/a.jpg"><h4>Уход</h4>')).toBe('Уход');
  });
});
