import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceProblems, attr, fieldOf, panelOf, renderSection, tags, type RenderedSection } from './shop-section-render';

// «Контактная форма» — новая секция библиотеки (базовые секции, 29.10): панель — как у ContactForm на проде
// (CustomFieldsPanel): «Заголовок», «Размер заголовка», «Текст», «Размер текста», «Цветовая схема», «Отступы»; поля формы
// (имя, email, телефон, сообщение: включено, обязательно, подпись) на проде не показаны в панели — здесь это блоки.
// КАК НА ПРОДЕ, ФОРМА НИЧЕГО НЕ ОТПРАВЛЯЕТ: «Спасибо!» без запроса. Настоящая отправка — отдельная задача.
const FIELDS = [
  { id: 'name-1', type: 'name', settings: { label: 'Ваше имя', required: true } },
  { id: 'email-1', type: 'email', settings: { label: 'Email', required: true } },
  { id: 'phone-1', type: 'phone', settings: { label: 'Телефон', required: false } },
  { id: 'message-1', type: 'message', settings: { label: 'Сообщение', required: false } },
];

let section: RenderedSection;
beforeAll(async () => {
  section = await renderSection('contact-form');
}, 60_000);
afterAll(async () => {
  await section.close();
});

const root = (source: string): string => tags(source, 'div').find((tag) => tag.includes('data-button-position=')) ?? '';

describe('«Контактная форма»: панель', () => {
  it('принимается без проблем и предупреждений', async () => {
    expect(await acceptanceProblems('contact-form')).toEqual([]);
  }, 60_000);

  it('поля прода в их порядке и с их подписями; новые — в группах «Вид» и «Форма»', () => {
    expect(panelOf(section.manifest)).toEqual([
      ['heading', 'Заголовок', 'Содержание'],
      ['heading-size', 'Размер заголовка', undefined],
      ['text', 'Текст', undefined],
      ['text-size', 'Размер текста', undefined],
      ['wrapper:scheme', undefined, undefined],
      ['wrapper:padding', undefined, undefined],
      ['layout', 'Раскладка', 'Вид'],
      ['align', 'Выравнивание заголовка', undefined],
      ['button-position', 'Положение кнопки', undefined],
      ['button-label', 'Кнопка', 'Форма'],
    ]);
    expect(section.manifest.title).toBe('Контактная форма');
  });

  it('заголовок и текст — с ИИ; положение кнопки видно только в форме в две колонки', () => {
    expect(fieldOf(section.manifest, 'heading')).toMatchObject({ setting: { kind: 'string', ai: 'title' } });
    expect(fieldOf(section.manifest, 'text')).toMatchObject({ setting: { kind: 'text', ai: 'description' } });
    expect(fieldOf(section.manifest, 'button-position')).toMatchObject({ visibleWhen: { setting: 'layout', equals: 'columns' } });
  });

  it('поля прода — блоки: имя, email, телефон, сообщение; у каждого подпись и «Обязательное»; по умолчанию без телефона', () => {
    const blocks = section.manifest.blocks ?? {};
    expect(Object.keys(blocks)).toEqual(['name', 'email', 'phone', 'message']);
    for (const block of Object.values(blocks)) {
      expect(block.limit).toBe(1);
      expect(block.settings.map((field) => field.id)).toEqual(['label', 'required']);
    }
    expect((section.manifest.defaultBlocks ?? []).map((block) => block.type)).toEqual(['name', 'email', 'message']);
  });

  it('форма ничего не отправляет: частей SDK у секции нет', () => {
    expect(section.manifest.uses ?? []).toEqual([]);
  });
});

describe('«Контактная форма»: разметка', () => {
  it('по умолчанию — вид flux: одна колонка, заголовок по центру', async () => {
    const source = await section.html({ blocks: FIELDS });
    const tag = root(source);
    expect(attr(tag, 'data-layout')).toBe('single');
    expect(attr(tag, 'data-align')).toBe('center');
    expect(tags(source, 'form')[0]).toContain('data-action="submit"');
    expect(tags(source, 'button')[0]).toContain('type="submit"');
    expect(source).toContain('>Отправить</button>');
  });

  it('поля — по блокам и по порядку: подпись, звёздочка у обязательных, тип поля, сообщение — textarea', async () => {
    const source = await section.html({ blocks: FIELDS });
    const inputs = tags(source, 'input').map((tag) => [attr(tag, 'name'), attr(tag, 'type'), attr(tag, 'autocomplete'), attr(tag, 'inputmode'), /\srequired/.test(tag)]);
    expect(inputs).toEqual([
      ['name', 'text', 'name', 'text', true],
      ['email', 'email', 'email', 'text', true],
      ['phone', 'text', 'tel', 'tel', false],
    ]);
    expect(tags(source, 'textarea').map((tag) => [attr(tag, 'name'), /\srequired/.test(tag)])).toEqual([['message', false]]);
    expect(source).toContain('Ваше имя');
    expect(source.match(/aria-hidden="true" class="ml-1 text-destructive">\*</g)).toHaveLength(2);
  });

  it('каждое поле — внутри <label>: подпись связана с полем', async () => {
    const source = await section.html({ blocks: FIELDS });
    expect(source.match(/<label\b/g)).toHaveLength(4);
    expect(source.match(/<\/label>/g)).toHaveLength(4);
  });

  it('поле скрыто (блока нет) — его нет в форме', async () => {
    const source = await section.html({ blocks: FIELDS.filter((block) => block.type !== 'phone' && block.type !== 'message') });
    expect(tags(source, 'input')).toHaveLength(2);
    expect(tags(source, 'textarea')).toEqual([]);
  });

  it('заголовок и текст с начертаниями; пустые — их нет', async () => {
    const full = await section.html({ settings: { heading: 'Напишите <em>нам</em>', text: 'Ответим <strong>быстро</strong>' } });
    expect(full).toMatch(/<h2\b[^>]*>Напишите <em>нам<\/em><\/h2>/);
    expect(full).toMatch(/<p\b[^>]*>Ответим <strong>быстро<\/strong><\/p>/);
    const empty = await section.html({ settings: { heading: '', text: '' } });
    expect(tags(empty, 'h2')).toEqual([]);
    expect(tags(empty, 'p').filter((tag) => !tag.includes('data-ref'))).toEqual([]);
  });

  it.each([['single'], ['columns']])('раскладка %s, положение кнопки и выравнивание — признаки на корне', async (layout) => {
    const source = await section.html({ blocks: FIELDS, settings: { layout, 'button-position': 'left', align: 'left' } });
    const tag = root(source);
    expect(attr(tag, 'data-layout')).toBe(layout);
    expect(attr(tag, 'data-button-position')).toBe('left');
    expect(attr(tag, 'data-align')).toBe('left');
  });

  it('«Спасибо!» скрыто до отправки', async () => {
    const source = await section.html({ blocks: FIELDS });
    expect(tags(source, 'p').find((tag) => attr(tag, 'data-ref') === 'thanks')).toMatch(/\shidden/);
  });
});
