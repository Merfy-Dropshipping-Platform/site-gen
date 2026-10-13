/**
 * Задача 5.1 спеки 120: тумблер features.extensionPurchase темы → проп
 * extensionPurchaseEnabled секции «Товар» (форма расширения вместо кнопки
 * покупки). Инжект — в общей точке extractPageBlocks, как у requestsEnabled
 * (requests-product-flag.spec.ts); значение решает манифест темы. Включено
 * только на flux (решение владельца: «только на одной теме флюкс»).
 */
import { extractPageBlocks } from '../page-blocks';

jest.mock('../theme-manifest-loader', () => ({
  ...jest.requireActual('../theme-manifest-loader'),
  getThemeManifest: (id: string) => ({
    features: { requests: true, extensionPurchase: id === 'flux' },
  }),
}));

function revisionWithProduct(page: string) {
  return {
    pagesData: {
      [page]: { content: [{ type: 'Product', props: { id: 'Product-1' } }] },
    },
  } as Record<string, unknown>;
}

async function productProps(
  themeId: string,
  page = 'page-product',
): Promise<Record<string, unknown> | undefined> {
  const blocks = await extractPageBlocks(
    revisionWithProduct(page),
    page,
    null,
    themeId,
    'site-1',
  );
  return (blocks || []).find((b) => b.type === 'Product')?.props;
}

describe('extensionPurchase: тумблер features.extensionPurchase → Product.extensionPurchaseEnabled', () => {
  it('flux: флаг включён → проп true', async () => {
    expect((await productProps('flux'))?.extensionPurchaseEnabled).toBe(true);
  });

  it.each(['rose', 'vanilla', 'satin', 'bloom'])(
    '%s: флаг выключен → пропа нет',
    async (themeId) => {
      expect((await productProps(themeId))?.extensionPurchaseEnabled).toBeUndefined();
    },
  );

  it('работает и на странице с адресом product', async () => {
    expect((await productProps('flux', 'product'))?.extensionPurchaseEnabled).toBe(true);
  });

  it('только на странице товара, не на остальных', async () => {
    expect((await productProps('flux', 'home'))?.extensionPurchaseEnabled).toBeUndefined();
  });

  it('старый проп requestsEnabled ставится как раньше: выбор между ними делает секция', async () => {
    const props = await productProps('flux');
    expect(props?.requestsEnabled).toBe(true);
    expect(props?.extensionPurchaseEnabled).toBe(true);
  });

  it('реальные манифесты: только flux включает форму расширения', () => {
    const features = (theme: string) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require(`../../../packages/theme-${theme}/theme.json`) as {
        features?: Record<string, boolean>;
      }).features;
    expect(features('flux')?.extensionPurchase).toBe(true);
    for (const theme of ['rose', 'vanilla', 'satin', 'bloom']) {
      expect(features(theme)?.extensionPurchase).not.toBe(true);
    }
  });
});
