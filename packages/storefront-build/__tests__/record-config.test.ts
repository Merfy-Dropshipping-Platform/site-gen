import { describe, expect, it } from 'vitest';
import { pageLocals } from '../src/head';
import type { BuildInputs } from '../src/inputs';
import { routeOf } from '../src/routes';
import { P1, placed, policy, product, recordInputs } from './support-records';
import { novaTokens } from './support-theme';

// page.record в конфиге витрины (блок 8 «Секций и SDK», часть 8б-2, Р8б-13): вид и id записи страницы — для аналитики
// товара (блок 13) и сторов расширений; у страниц сайта ключа нет.
const CONFIG = /<script type="application\/json" id="merfy-config">([\s\S]*?)<\/script>/;
const configAt = (inputs: BuildInputs, path: string): unknown =>
  JSON.parse(CONFIG.exec(pageLocals(inputs, routeOf(path, inputs), novaTokens).head.configHtml)?.[1] ?? 'null');
const TEMPLATES = { product: [placed('product-1')] };

describe('page.record в конфиге витрины', () => {
  it('страница записи — вид и id записи; у политики id — её тип', () => {
    const inputs = recordInputs([product(P1), policy('privacy', 'Мы бережём данные')], TEMPLATES);
    expect(configAt(inputs, '/product/sharf')).toMatchObject({
      page: { id: 'product', path: '/product/sharf', record: { type: 'product', id: P1 } },
    });
    expect(configAt(inputs, '/legal/privacy')).toMatchObject({
      page: { id: 'policy', path: '/legal/privacy', record: { type: 'policy', id: 'privacy' } },
    });
  });

  it('главная и 404 — без record, как раньше', () => {
    const inputs = recordInputs([product(P1)], TEMPLATES);
    expect(configAt(inputs, '/')).toMatchObject({ page: { id: 'home', path: '/' } });
    expect(JSON.stringify(configAt(inputs, '/'))).not.toContain('"record"');
    expect(JSON.stringify(configAt(inputs, '/404'))).not.toContain('"record"');
  });
});
