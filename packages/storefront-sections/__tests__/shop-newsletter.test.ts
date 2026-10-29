import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceProblems, attr, fieldOf, panelOf, renderSection, tags, type RenderedSection } from './shop-section-render';

// «Подписка на рассылку» — новая секция библиотеки (базовые секции, 29.10; расширения E1 и E12): панель — как у Newsletter
// на проде (CustomFieldsPanel): «Согласие на рассылку», «Текст согласия», «Сделать ссылкой», «Текст», «Выравнивание»,
// «Цветовая схема», «Отступы»; заголовок — блок, форма рассылки — «Плейсхолдер» и «Кнопка». Подписка — часть newsletter ядра
// (тот же запрос, что у «Подвала» и у rose и flux на проде); скрипт проверяют на витрине (тексты, исходы, повтор).
const HEADING = [{ id: 'heading-1', type: 'heading', settings: { heading: 'Будьте <em>в курсе</em>', 'heading-size': 'large' } }];
const BUTTON = [{ id: 'button-2', type: 'button', settings: { 'button-label': 'Подписаться' } }];
const SHOP =(policies: { type: string; title: string; url: string }[]) => ({
  name: 'Мой сайт',
  contacts: { phone: '', email: '', fields: [] },
  policies,
  payments: { online: false },
});

let section: RenderedSection;
beforeAll(async () => {
  section = await renderSection('newsletter');
}, 60_000);
afterAll(async () => {
  await section.close();
});

const root = (source: string): string => tags(source, 'div').find((tag) => tag.includes('data-form-layout=')) ?? '';

describe('«Подписка на рассылку»: панель', () => {
  it('принимается без проблем и предупреждений', async () => {
    expect(await acceptanceProblems('newsletter')).toEqual([]);
  }, 60_000);

  it('поля прода в их порядке и с их подписями; новые — в группе «Вид»', () => {
    expect(panelOf(section.manifest)).toEqual([
      ['agreement', 'Согласие на рассылку', undefined],
      ['agreement-text', 'Текст согласия', undefined],
      ['agreement-link', 'Сделать ссылкой', undefined],
      ['text', 'Текст', undefined],
      ['text-size', 'Размер текста', undefined],
      ['align', 'Выравнивание', undefined],
      ['wrapper:scheme', undefined, undefined],
      ['wrapper:padding', undefined, undefined],
      ['placeholder', 'Плейсхолдер', 'Форма рассылки'],
      ['layout', 'Раскладка', 'Вид'],
      ['form-layout', 'Форма', undefined],
    ]);
  });

  it('текст согласия и «Сделать ссылкой» видны всегда и неактивны при выключенном согласии, как на проде; тексты — с «К» и «Ж»', () => {
    for (const id of ['agreement-text', 'agreement-link']) {
      expect(fieldOf(section.manifest, id)).toMatchObject({ disabledWhen: { setting: 'agreement', equals: false } });
      expect(fieldOf(section.manifest, id)).not.toHaveProperty('visibleWhen');
    }
    for (const id of ['agreement-text', 'text']) {
      expect(fieldOf(section.manifest, id)).toMatchObject({ setting: { kind: 'text', ai: 'description' } });
    }
    const heading = section.manifest.blocks?.heading;
    expect(heading?.settings[0]?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(heading?.limit).toBe(1);
  });

  it('«Кнопка» — блок, как у прода: подпись в одном поле, не больше одного, по умолчанию стоит', () => {
    const button = section.manifest.blocks?.button;
    // Название — «Кнопка», как у прода; «Добавить кнопку» — подписью addTitle (без неё было бы «Добавить кнопка»).
    expect(button?.title).toBe('Кнопка');
    expect(button?.addTitle).toBe('кнопку');
    expect(button?.limit).toBe(1);
    expect(button?.settings.map((field) => [field.id, field.label])).toEqual([['button-label', 'Кнопка']]);
    expect(section.manifest.defaultBlocks?.map((block) => block.type)).toEqual(['heading', 'button']);
  });

  it('подписку делает часть newsletter ядра', () => {
    expect(section.manifest.uses).toContain('newsletter');
  });
});

describe('«Подписка на рассылку»: разметка', () => {
  it('по умолчанию — вид flux: колонка по левому краю, кнопка под полем; форма с подписью поля, ответы скрыты', async () => {
    const source = await section.html({ blocks: [...HEADING, ...BUTTON] });
    const tag = root(source);
    expect(attr(tag, 'data-layout')).toBe('column');
    expect(attr(tag, 'data-align')).toBe('left');
    expect(attr(tag, 'data-form-layout')).toBe('stacked');
    expect(tags(source, 'form')[0]).toContain('data-action="subscribe"');
    expect(source).toMatch(/<label\b[^>]*for="newsletter-email"/);
    expect(source).toMatch(/<input\b[^>]*type="email"/);
    expect(source).toContain('>Подписаться</button>');
    for (const notice of ['subscribed', 'already-subscribed', 'too-many', 'invalid', 'consent-missing', 'failed']) {
      expect(tags(source, 'p').find((item) => attr(item, 'data-ref') === notice)).toMatch(/\shidden/);
    }
  });

  it('заголовок и текст с начертаниями, размеры — признаками', async () => {
    const source = await section.html({ blocks: HEADING, settings: { text: 'Скидки <strong>раз в неделю</strong>', 'text-size': 'large' } });
    expect(source).toMatch(/<h2\b[^>]*data-heading-size="large"[^>]*>Будьте <em>в курсе<\/em><\/h2>/);
    expect(source).toMatch(/<p\b[^>]*data-text-size="large"[^>]*>Скидки <strong>раз в неделю<\/strong><\/p>/);
  });

  it('блока «Заголовок» нет (скрыт в конструкторе) — заголовка нет, текст остаётся', async () => {
    const source = await section.html({});
    expect(tags(source, 'h2')).toEqual([]);
    expect(source).toContain('Узнавайте первыми');
  });

  it('заголовка и текста нет — остаётся одна форма', async () => {
    const source = await section.html({ settings: { text: '' } });
    expect(tags(source, 'h2')).toEqual([]);
    expect(tags(source, 'p').filter((item) => !item.includes('data-ref'))).toEqual([]);
    expect(source).toContain('<form');
  });

  it.each([['inline-submit'], ['stacked']])('вид формы %s — кнопка в поле или под ним, поле и кнопка есть', async (formLayout) => {
    const blocks = [{ id: 'button-2', type: 'button', settings: { 'button-label': 'Хочу' } }];
    const source = await section.html({ blocks, settings: { 'form-layout': formLayout, placeholder: 'Ваш e-mail' } });
    expect(attr(root(source), 'data-form-layout')).toBe(formLayout);
    expect(source).toMatch(/<input\b[^>]*placeholder="Ваш e-mail"/);
    expect(source).toContain('>Хочу</button>');
    expect(tags(source, 'button')).toHaveLength(1);
    expect(source.includes('pl-4 pr-1.5')).toBe(formLayout === 'inline-submit');
  });

  it('блока «Кнопка» нет (удалён в конструкторе) — кнопки нет, поле остаётся', async () => {
    const source = await section.html({ blocks: HEADING });
    expect(tags(source, 'button')).toEqual([]);
    expect(source).toMatch(/<input\b[^>]*type="email"/);
  });

  it.each([['column'], ['row']])('раскладка %s и выравнивание — признаки на корне', async (layout) => {
    const source = await section.html({ settings: { layout, align: 'center' } });
    expect(attr(root(source), 'data-layout')).toBe(layout);
    expect(attr(root(source), 'data-align')).toBe('center');
  });

  describe('согласие', () => {
    it('выключено — флажка нет', async () => {
      expect(await section.html()).not.toContain('type="checkbox"');
    });

    it('включено — флажок и текст согласия с «Ж»', async () => {
      const source = await section.html({ settings: { agreement: true, 'agreement-text': 'Согласен на <strong>рассылку</strong>' } });
      expect(source).toMatch(/<input\b[^>]*data-ref="consent"[^>]*type="checkbox"/);
      expect(source).toContain('Согласен на <strong>рассылку</strong>');
      expect(tags(source, 'a')).toEqual([]);
    });

    it('«Сделать ссылкой» — текст ведёт на политику конфиденциальности магазина; нет политики — остаётся текстом', async () => {
      const settings = { agreement: true, 'agreement-link': true };
      const privacy = SHOP([{ type: 'privacy', title: 'Политика конфиденциальности', url: '/legal/privacy' }]);
      const linked = await section.html({ settings, shop: privacy });
      expect(tags(linked, 'a').map((tag) => attr(tag, 'href'))).toEqual(['/legal/privacy']);
      // На телефоне ссылка не ниже 44 px (проверка look: tap-small).
      expect(attr(tags(linked, 'a')[0] ?? '', 'class')).toContain('min-h-11');
      const plain = await section.html({ settings, shop: SHOP([{ type: 'refund', title: 'Возврат', url: '/legal/refund' }]) });
      expect(tags(plain, 'a')).toEqual([]);
      expect(plain).toContain('Согласен на обработку персональных данных');
    });
  });
});
