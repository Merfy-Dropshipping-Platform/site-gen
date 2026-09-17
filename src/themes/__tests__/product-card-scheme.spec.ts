import { buildTokensCss } from '../tokens-css';

/**
 * Пункт 4 пачки тестировщика (13.09), вторая половина: «под всеми параметрами
 * [вкладки «Карточки товара»] добавить выбор цветовой схемы, как в сайдбарах».
 *
 * Настройка обязана КРАСИТЬ карточку, а не просто сохраняться: мёртвых полей в
 * панели быть не должно. Канал тот же, что у остальных настроек темы —
 * themeSettings → buildTokensCss → tokens.css (один и тот же файл собирает и
 * превью конструктора, и витрину).
 *
 * Селектор `[data-nt$="-product-card"]` — общий маркер карточки во всех пяти
 * темах (rose/flux/vanilla/bloom/satin ставят его и в SSR, и в клиентских
 * дорисовках: storefront-hydrate, wishlist).
 *
 * Замер «до»: слова `productCardScheme` в tokens-css.ts не было вовсе —
 * выбранная схема никуда не доезжала.
 */
const scheme = (
  n: number,
  bg: string,
  surface: string,
  text: string,
) => ({
  id: `scheme-${n}`,
  name: String(n),
  background: bg,
  surfaceBg: surface,
  heading: text,
  text,
  primaryButton: { background: text, text: bg },
  secondaryButton: { background: surface, text },
});

const SCHEMES = [
  scheme(1, '#ffffff', '#f5f5f5', '#000000'),
  scheme(2, '#f4f1ec', '#ffffff', '#111111'),
  scheme(3, '#111111', '#222222', '#ffffff'),
];

/**
 * ВСЕ правила карточки товара по порядку появления в CSS (может быть одно —
 * безусловная самопривязка `--product-card-bg`, — или два, когда мерчант ещё
 * и явно выбрал схему ИМЕННО для карточки: тогда второе правило переобъявляет
 * ту же переменную поверх первого, и при равной специфичности побеждает ПО
 * ПОРЯДКУ — оно идёт в CSS позже).
 */
function allCardRules(css: string): string[] {
  const rules: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf('[data-nt$="-product-card"]', from);
    if (at < 0) break;
    const end = css.indexOf('}', at);
    rules.push(css.slice(at, end + 1));
    from = end + 1;
  }
  return rules;
}

/** Правило, которое РЕАЛЬНО побеждает на карточке (последнее в каскаде). */
function cardRule(css: string): string {
  const rules = allCardRules(css);
  return rules[rules.length - 1] ?? '';
}

describe('Настройки темы → «Карточки товара» → цветовая схема', () => {
  // b60 (2026-09-17): подложка карточки НЕ следовала схеме СЕКЦИИ, в которой
  // карточка стоит (каталог/популярные товары/коллекции), а замирала на
  // дефолтной схеме сайта — та же причина (`var()` внутри кастомного свойства
  // резолвится на :root, где объявлен `--product-card-bg`), но проявляется
  // БЕЗ какого-либо мерчантского выбора productCardScheme: обычная секция со
  // своей `.color-scheme-N` — уже достаточное условие для бага. Замер в
  // браузере (playwright, dist/theme-css/*.css + buildTokensCss) до фикса:
  // rose/vanilla/bloom/satin/flux — во всех пяти computed background-color
  // карточки совпадал между схемой 1 и схемой 4 (2 у flux), хотя сама
  // `--color-surface` на карточке уже была верной для каждой схемы.
  it('без выбора схемы правило всё равно есть — самопривязка --product-card-bg к своей секции', () => {
    const css = buildTokensCss({ colorSchemes: SCHEMES, productCardStyle: 'card' }, 'rose');
    const rules = allCardRules(css);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('--product-card-bg:');
    // Без явного мерчантского выбора схемы карточки самопривязка НЕ красит
    // остальную палитру (bg/heading/text/кнопки) — только подложку. Полный
    // оверрайд остаётся эксклюзивом productCardScheme (ниже).
    expect(rules[0]).not.toMatch(/--color-bg:|--color-heading:|--color-text:/);
  });

  it('выбранная схема красит карточку своими цветами', () => {
    const css = buildTokensCss(
      { colorSchemes: SCHEMES, productCardScheme: 'scheme-3' },
      'rose',
    );
    const rule = cardRule(css);
    expect(rule).toContain('--color-bg: 17 17 17');
    expect(rule).toContain('--color-surface: 34 34 34');
    expect(rule).toContain('--color-text: 255 255 255');
  });

  it('подложка карточки берёт surface ВЫБРАННОЙ схемы, а не :root', () => {
    // --product-card-bg объявлен в :root и подставляет var() на :root, то есть
    // на карточке остался бы цвет активной схемы сайта. Поэтому правило
    // карточки переобъявляет его у себя.
    const css = buildTokensCss(
      {
        colorSchemes: SCHEMES,
        productCardScheme: 'scheme-3',
        productCardStyle: 'card',
      },
      'rose',
    );
    expect(cardRule(css)).toContain('--product-card-bg:');
  });

  it('стиль «Стандарт» остаётся без подложки даже со схемой', () => {
    const css = buildTokensCss(
      {
        colorSchemes: SCHEMES,
        productCardScheme: 'scheme-2',
        productCardStyle: 'standard',
      },
      'rose',
    );
    expect(cardRule(css)).toContain('--product-card-bg: transparent');
  });

  it('несуществующая схема — только самопривязка, без цветового оверрайда', () => {
    const css = buildTokensCss(
      { colorSchemes: SCHEMES, productCardScheme: 'scheme-99', productCardStyle: 'card' },
      'rose',
    );
    const rules = allCardRules(css);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('--product-card-bg:');
    expect(rules[0]).not.toMatch(/--color-bg:|--color-heading:|--color-text:/);
  });
});

describe('b60: подложка карточки следует схеме СЕКЦИИ (без явного productCardScheme)', () => {
  // Сторож главного бага задачи: карточка стоит в секции со своей
  // `.color-scheme-N` (владелец выбрал схему для каталога/популярных
  // товаров/коллекции), продуктовая схема КАРТОЧКИ мерчант не трогал. Правило
  // самопривязки обязано резолвить `--color-surface` НА САМОЙ КАРТОЧКЕ (а не
  // на :root), иначе оно бесполезно и баг возвращается молча.
  it.each(['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const)(
    '%s: правило карточки читает var(--color-surface), а не литерал/чужую схему',
    (theme) => {
      const css = buildTokensCss({ productCardStyle: 'card' }, theme);
      const rule = cardRule(css);
      expect(rule).toContain('--product-card-bg:');
      // Обязательно var(--color-surface — резолвится ПО МЕСТУ (на карточке),
      // а не константа схемы по умолчанию, посчитанная заранее.
      expect(rule).toMatch(/--product-card-bg:\s*rgb\(var\(--color-surface/);
    },
  );

  it('regression guard: если --product-card-bg вернётся ТОЛЬКО в :root (без правила на карточке), тест обязан покраснеть', () => {
    // Позитивная сторона того же инварианта: правило карточки — единственное
    // место, где `--product-card-bg` резолвится в контексте секции. Если его
    // убрать, `:root`-значение снова "заморозится" на дефолтной схеме сайта.
    const css = buildTokensCss({ productCardStyle: 'card' }, 'rose');
    const cardRuleText = cardRule(css);
    const rootBlock = css.slice(0, css.indexOf('}') + 1);
    expect(rootBlock).toContain('--product-card-bg:');
    expect(cardRuleText).toContain('--product-card-bg:');
  });
});
