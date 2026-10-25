import { describe, expect, it } from 'vitest';
import { themeTokensCss } from '../src/fonts';
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

  it('конфиг магазина: адрес сборщика аналитики и счётчики мерчанта (блок 11)', () => {
    expect(configOf(locals.head.configHtml)).toMatchObject({
      analytics: { url: 'http://localhost:4321/api/analytics', counters: [{ kind: 'metrika', number: '12345678' }] },
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

  // Теги для соцсетей (блок 9): заголовок, описание и адрес у них те же, что у страницы; здесь — остальное.
  it('теги для соцсетей: website, имя магазина, ru_RU, карточка summary; логотипа нет — картинки нет', () => {
    expect(locals.head.social).toEqual({
      type: 'website',
      siteName: 'Стенд Nova',
      locale: 'ru_RU',
      image: '',
      card: 'summary',
    });
  });

  // Картинка для соцсетей — логотип из брендинга, если соцсети его покажут: адрес https, PNG, JPEG, WebP или GIF.
  it('логотип PNG по https — картинка для соцсетей; имени нет — в тегах адрес магазина', () => {
    const logo = changedInputs((inputs) =>
      Object.assign(inputs.site, { name: ' ', logoUrl: ' https://s3.merfy.ru/merfy/branding/logo-1.png ' }),
    );
    expect(pageLocals(logo, HOME, novaTokens).head.social).toMatchObject({
      siteName: 'nova-stand.example',
      image: 'https://s3.merfy.ru/merfy/branding/logo-1.png',
    });
  });

  it.each([
    ['SVG', 'https://s3.merfy.ru/merfy/branding/logo-1.svg'],
    ['по http', 'http://s3.merfy.ru/merfy/branding/logo-1.png'],
    ['путь без адреса', '/branding/logo-1.png'],
    ['не адрес', 'логотип'],
  ])('логотип %s — картинки для соцсетей нет, сборка идёт', (_title, logoUrl) => {
    const logo = changedInputs((inputs) => (inputs.site.logoUrl = logoUrl));
    expect(pageLocals(logo, HOME, novaTokens).head.social.image).toBe('');
  });

  it('CSS токенов — с правками мерчанта из ревизии', () => {
    // Стеки шрифтов — по реестру (блок 12): CSS токенов страницы печатает themeTokensCss.
    const edited = themeTokensCss(novaTokens, { root: { 'radius-button': 4 } });
    expect(locals.head.tokensCss).toBe(edited);
    expect(locals.head.tokensCss).not.toBe(themeTokensCss(novaTokens, {}));
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

describe('pageLocals: «свой код» мерчанта (блок 13 «Секций и SDK», часть 13б)', () => {
  const customCode = (id: string, code: string, consent: string) => ({
    type: 'custom-code' as const,
    id,
    updatedAt: '1970-01-01T00:00:00.000Z',
    data: { code, consent },
  });

  it('сущности custom-code — analytics.custom по id пикселя; без них поля custom нет', () => {
    const inputs = changedInputs((changed) => {
      changed.data.entities.push(
        customCode('p-2', '<script>second()</script>', 'none'),
        customCode('p-1', '<script>first()</script>', 'required'),
      );
    });
    expect(configOf(pageLocals(inputs, HOME, novaTokens).head.configHtml)).toMatchObject({
      analytics: {
        custom: [
          { code: '<script>first()</script>', consent: 'required' },
          { code: '<script>second()</script>', consent: 'none' },
        ],
      },
    });
    expect(locals.head.configHtml).not.toContain('"custom"');
  });
});
