import { describe, expect, it } from 'vitest';
import { PAGE_CONCURRENCY, buildStorefront, type ThemeBuild } from '../src/build';
import { NO_ASSETS } from '../src/code';
import type { RenderPage } from '../src/page';
import { ID, RECORD_HASH, RECORD_MODULE, placed, product, recordInputs, recordRender } from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// Тысячи товаров (блок 8 «Секций и SDK», часть 8б; риск 1 design.md): страница на каждый товар, рендер — по
// PAGE_CONCURRENCY страниц за раз, порядок страниц — прежний. RECORD_PAGES=5000 — замер для отчёта.
const COUNT = Number(process.env.RECORD_PAGES ?? '1000');

describe('сборка магазина с тысячами товаров', () => {
  it('страница на каждый товар по порядку; одновременно рендерится не больше PAGE_CONCURRENCY страниц', async () => {
    let running = 0;
    let most = 0;
    const render: RenderPage = async (path, locals) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return fakeRender(path, locals);
    };
    const products = Array.from({ length: COUNT }, (_, index) =>
      product(ID(10_000 + index), { handle: `sharf-${index}`, collectionIds: [] }),
    );
    const inputs = recordInputs(products, { product: [placed('product-1')] });
    const theme: ThemeBuild = { tokens: novaTokens, render, clientFiles: [] };
    const assets = { ...NO_ASSETS, renders: new Map([[RECORD_HASH, RECORD_MODULE]]) };
    const { manifest } = await buildStorefront(
      inputs,
      { platformCommit: 'c'.repeat(40) },
      theme,
      assets,
      recordRender(),
    );
    expect(manifest.pages).toHaveLength(COUNT + 1);
    expect(manifest.pages.slice(0, 3).map((page) => page.path)).toEqual(['/', '/product/sharf-0', '/product/sharf-1']);
    expect(PAGE_CONCURRENCY).toBe(8);
    expect(most).toBeLessThanOrEqual(PAGE_CONCURRENCY);
  }, 180_000);
});
