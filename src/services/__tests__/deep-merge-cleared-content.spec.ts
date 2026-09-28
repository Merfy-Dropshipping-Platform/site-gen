import { deepMergeBlockProps } from '../preview.service';

/**
 * Мерчант стёр заголовок/текст секции — на превью и витрине он должен стать
 * пустым, а не вернуться текстом темы.
 *
 * Владелец 26.09 (bloom, «Коллекция товаров»): удалил заголовок — на его месте
 * снова «Коллекция товаров» из `theme.json blockDefaults`. Причина — правило
 * `'' → дефолт темы` в deepMergeBlockProps, заведённое 07.09 ради `logo: ""`
 * сида шапки. Для текста мерчанта пустая строка — это его ввод, не «не задано».
 */
describe('deepMergeBlockProps: стёртый текст секции остаётся пустым', () => {
  it('заголовок строкой', () => {
    const out = deepMergeBlockProps({ heading: 'Коллекция товаров' }, { heading: '' });
    expect(out.heading).toBe('');
  });

  it('заголовок и текст объектами — пусто, соседние ключи темы остаются', () => {
    const out = deepMergeBlockProps(
      {
        heading: { text: 'Изображение', size: 'large' },
        text: { content: 'Уходовая косметика', size: 'small' },
      },
      { heading: { text: '' }, text: { content: '' } },
    );
    expect(out.heading).toEqual({ text: '', size: 'large' });
    expect(out.text).toEqual({ content: '', size: 'small' });
  });

  it('вложенный текст подвала (newsletter.heading) тоже не возвращается', () => {
    const out = deepMergeBlockProps(
      { newsletter: { heading: 'Подпишитесь на нашу рассылку', enabled: true } },
      { newsletter: { heading: '' } },
    );
    expect(out.newsletter).toEqual({ heading: '', enabled: true });
  });

  it('поле не задано вовсе — берётся текст темы, как раньше', () => {
    const out = deepMergeBlockProps({ heading: 'Коллекция товаров' }, {});
    expect(out.heading).toBe('Коллекция товаров');
  });

  it('служебная настройка с пустой строкой по-прежнему берёт значение темы', () => {
    const out = deepMergeBlockProps({ logoPosition: 'top-center' }, { logoPosition: '' });
    expect(out.logoPosition).toBe('top-center');
  });
});
