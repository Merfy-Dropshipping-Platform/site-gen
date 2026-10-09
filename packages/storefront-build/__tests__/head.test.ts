import { tokensCss } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { pageLocals } from '../src/head';
import { routeOf } from '../src/routes';
import { changedInputs, errorOf, standInputs } from './support';
import { novaTokens } from './support-theme';

const HOME = routeOf('/');
const locals = pageLocals(standInputs, HOME, novaTokens);

// JSON внутри тега <script type="application/json" id="merfy-config">.
const configOf = (tag: string): unknown => JSON.parse(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</script>')));

describe('pageLocals', () => {
  it('конфиг магазина: живой режим, адрес магазина, главная страница', () => {
    expect(locals.head.configHtml.startsWith('<script type="application/json" id="merfy-config">')).toBe(true);
    expect(configOf(locals.head.configHtml)).toMatchObject({
      mode: 'live',
      shop: { id: '00000000-0000-4000-8000-000000000001', name: 'Стенд Nova', url: 'https://nova-stand.example' },
      api: { url: 'http://localhost:4321/api' },
      theme: { id: 'nova', version: '0.0.1' },
      page: { id: 'home', path: '/' },
    });
  });

  it('язык, заголовок, описание и канонический адрес — из входов', () => {
    expect(locals.head).toMatchObject({
      lang: 'ru-RU',
      title: 'Стенд Nova',
      description: 'Магазин-стенд новой темы',
      keywords: '',
      canonical: 'https://nova-stand.example/',
    });
  });

  // Заполненное мерчантом попадает в страницу (владелец 08.10): SEO-заголовок — в <title>, ключевые слова — в head.
  // Имя магазина в конфиге и на странице остаётся именем.
  it('SEO-заголовок и ключевые слова мерчанта — в заголовке страницы и head', () => {
    const seo = changedInputs((inputs) =>
      Object.assign(inputs.site, { seoTitle: ' Шарфы изо льна — Стенд Nova ', keywords: ' шарфы, лён ' }),
    );
    const { head, shop } = pageLocals(seo, HOME, novaTokens);
    expect(head).toMatchObject({ title: 'Шарфы изо льна — Стенд Nova', keywords: 'шарфы, лён' });
    expect(shop).toEqual({ name: 'Стенд Nova' });
    expect(configOf(head.configHtml)).toMatchObject({ shop: { name: 'Стенд Nova' } });
  });

  // Незаполненное мерчантом сборку не валит (владелец 08.10): описания и ключевых слов нет — теги не рисуются; ни
  // SEO-заголовка, ни имени — в заголовке, конфиге и на странице адрес магазина.
  it('имя и SEO из пробелов — описания и ключевых слов нет, вместо заголовка и имени адрес магазина', () => {
    const empty = changedInputs((inputs) =>
      Object.assign(inputs.site, { name: '  ', description: ' ', seoTitle: ' ', keywords: ' ' }),
    );
    const { head, shop } = pageLocals(empty, HOME, novaTokens);
    expect(head).toMatchObject({ title: 'nova-stand.example', description: '', keywords: '' });
    expect(shop).toEqual({ name: 'nova-stand.example' });
    expect(configOf(head.configHtml)).toMatchObject({ shop: { name: 'nova-stand.example' } });
  });

  it('CSS токенов — с правками мерчанта из ревизии', () => {
    const edited = tokensCss(novaTokens.dictionary, novaTokens.tokens, { root: { 'radius-button': 4 } });
    expect(locals.head.tokensCss).toBe(edited);
    expect(locals.head.tokensCss).not.toBe(tokensCss(novaTokens.dictionary, novaTokens.tokens, {}));
  });

  it('имя магазина и год — для страницы', () => {
    expect(locals.shop).toEqual({ name: 'Стенд Nova' });
    expect(locals.year).toBe(2026);
  });

  it('правка к токену, которого нет в теме, — inputs-invalid в revision.tokens', () => {
    const inputs = changedInputs((changed) => (changed.revision.tokens = { root: { 'no-such-token': 1 } }));
    const error = errorOf(() => pageLocals(inputs, HOME, novaTokens));
    expect(error.code).toBe('inputs-invalid');
    expect(error.path).toBe('revision.tokens');
  });
});
