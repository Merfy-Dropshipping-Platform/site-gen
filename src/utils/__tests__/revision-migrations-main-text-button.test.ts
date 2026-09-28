import { migrateRevisionData } from '../revision-migrations';

/**
 * «Основной текст»: кнопка из старого скрытого `cta` переезжает в поле панели.
 *
 * Баг тестировщика: «при пустом инпуте в кнопке он отображает кнопку, не
 * отображать при пустом». Стартовое наполнение тем клало кнопку в `cta`, поле
 * панели привязано к `button.{text,link}` — витрина кнопку показывала, инпут был
 * пуст. Бэкфилл переносит `cta` в поле, только пока поля «Кнопка» в секции нет:
 * то, что мерчант уже ввёл или очистил, сильнее старого `cta`.
 */
describe('backfillMainTextLegacyButton', () => {
  const LEGACY = { text: 'К покупкам', href: '/catalog', variant: 'primary' };
  const run = (props: Record<string, unknown>, type = 'MainText') =>
    (
      migrateRevisionData({
        pagesData: { home: { content: [{ type, props: { id: `${type}-1`, ...props } }] } },
      }) as { pagesData: Record<string, any> }
    ).pagesData.home.content[0].props;

  it('поля «Кнопка» нет — текст и ссылка cta переезжают в поле, cta остаётся', () => {
    const p = run({ heading: { text: 'О нас' }, cta: LEGACY });
    expect(p.button).toEqual({ text: 'К покупкам', link: { href: '/catalog' } });
    expect(p.cta).toEqual(LEGACY);
  });

  it('заготовка темы с `button: null` — тоже переезжает', () => {
    expect(run({ button: null, cta: LEGACY }).button).toEqual({
      text: 'К покупкам',
      link: { href: '/catalog' },
    });
  });

  it('мерчант очистил инпут — очищенное остаётся, cta не возвращается', () => {
    expect(run({ button: { text: '' }, cta: LEGACY }).button).toEqual({ text: '' });
  });

  it('текст в поле уже задан — не трогаем', () => {
    const button = { text: 'Купить', link: { href: '/new' } };
    expect(run({ button, cta: LEGACY }).button).toEqual(button);
  });

  it('ссылка cta в поле `link` — тоже переезжает', () => {
    expect(run({ cta: { text: 'Смотреть', link: '/catalog?sort=new' } }).button).toEqual({
      text: 'Смотреть',
      link: { href: '/catalog?sort=new' },
    });
  });

  it('пустой или пробельный текст cta — поля не создаём', () => {
    expect(run({ cta: { text: '   ', href: '/catalog' } })).not.toHaveProperty('button');
    expect(run({ cta: { href: '/catalog' } })).not.toHaveProperty('button');
  });

  it('повторный прогон ничего не меняет', () => {
    const once = migrateRevisionData({
      pagesData: { home: { content: [{ type: 'MainText', props: { id: 'MainText-1', cta: LEGACY } }] } },
    });
    expect(migrateRevisionData(once)).toEqual(once);
  });

  it('другие блоки с cta не трогаем', () => {
    expect(run({ cta: LEGACY }, 'PromoBanner')).not.toHaveProperty('button');
  });
});
