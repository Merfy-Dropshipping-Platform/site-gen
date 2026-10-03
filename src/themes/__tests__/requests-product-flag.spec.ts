/**
 * Спека 118 §5 (T013c): тумблер features.requests темы → проп requestsEnabled
 * секции «Товар». Инжект — в ОБЩЕЙ точке extractPageBlocks (её идут превью,
 * live-пересадка /product и per-slug renderProductSectionForId), значение
 * решает манифест темы (getThemeManifest); проп ревизии может включить форму
 * и без флага. Дефолт всех тем — false → props не меняются вовсе.
 */
import { extractPageBlocks } from '../page-blocks';
import { getThemeManifest } from '../theme-manifest-loader';

jest.mock('../theme-manifest-loader', () => ({
  ...jest.requireActual('../theme-manifest-loader'),
  getThemeManifest: (id: string) => ({
    features: { requests: id === 'flux' },
  }),
}));

function revisionWithProduct(props: Record<string, unknown> = {}) {
  return {
    pagesData: {
      'page-product': {
        content: [{ type: 'Product', props: { id: 'Product-1', ...props } }],
      },
    },
  } as Record<string, unknown>;
}

async function productProps(
  themeId: string,
  props: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const blocks = await extractPageBlocks(
    revisionWithProduct(props),
    'page-product',
    null,
    themeId,
    'site-1',
  );
  const product = (blocks || []).find((b) => b.type === 'Product');
  expect(product).toBeDefined();
  return product!.props;
}

describe('requests: тумблер features.requests → Product.requestsEnabled', () => {
  it('флаг темы выключен → проп не появляется (поведение тем не меняется)', async () => {
    const real = getThemeManifest('rose'); // мок выше: проверка реального дефолта ниже отдельно
    void real;
    const props = await productProps('vanilla');
    expect(props.requestsEnabled).toBeUndefined();
  });

  it('флаг темы включён → requestsEnabled=true (мок манифеста)', async () => {
    const props = await productProps('flux');
    expect(props.requestsEnabled).toBe(true);
  });

  it('проп ревизии включает форму и без флага', async () => {
    const props = await productProps('vanilla', { requestsEnabled: true });
    expect(props.requestsEnabled).toBe(true);
  });

  it('инжект только на странице товара (page-product), не на остальных', async () => {
    const blocks = await extractPageBlocks(
      {
        pagesData: {
          home: {
            content: [{ type: 'Product', props: { id: 'Product-1' } }],
          },
        },
      } as Record<string, unknown>,
      'home',
      null,
      'flux',
      'site-1',
    );
    const product = (blocks || []).find((b) => b.type === 'Product');
    expect(product?.props.requestsEnabled).toBeUndefined();
  });

  it('реальные манифесты всех 5 тем: features.requests=false (дефолт выключен)', () => {
    // мок не действует: читаем JSON напрямую, как loader
    for (const t of ['rose', 'vanilla', 'flux', 'satin', 'bloom']) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const manifest = require(`../../../packages/theme-${t}/theme.json`) as {
        features?: Record<string, boolean>;
      };
      expect(manifest.features?.requests).toBe(false);
    }
  });
});
