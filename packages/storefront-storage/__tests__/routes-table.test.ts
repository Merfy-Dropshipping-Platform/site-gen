import { describe, expect, it } from 'vitest';
import { parseRoutesTable } from '../src/formats';
import { hexOf } from '../src/layout';
import { GONE_DAYS, buildRoutesTable, type PreviousBuild } from '../src/routes-table';
import { HOME, SCARF, SHOP, STYLES, UPDATED_AT, buildOf, type PageSpec } from './manifests';

const NOW = '2026-10-07T12:00:00.000Z';
const WINTER = { ...SCARF, path: '/products/scarf-winter/' };
const POLICY = { path: '/policies/returns/', entity: 'policy:00000000-0000-4000-8000-000000000201' };
const ABOUT = { path: '/about/', entity: `site:${SHOP}` };

// Выкладка сборки с номером build поверх прошлой: манифест и его таблица раздачи.
function publish(pages: PageSpec[], build: number, previous: PreviousBuild | null = null, now = NOW): PreviousBuild {
  const { manifest } = buildOf(pages);
  return { manifest, table: buildRoutesTable({ manifest, build, previous, now }) };
}

describe('таблица раздачи сборки', () => {
  it('страница — по адресу и по файлу, с датой правки; стили темы — кэш навсегда', () => {
    const { manifest, table } = publish([HOME, SCARF], 1);
    const scarfRow = {
      h: hexOf(manifest.pages[1].hash),
      t: 'text/html; charset=utf-8',
      c: 'revalidate',
      m: UPDATED_AT,
    };
    expect(Object.keys(table.files).sort()).toEqual([
      '/',
      `/${STYLES}`,
      '/index.html',
      '/products/scarf/',
      '/products/scarf/index.html',
    ]);
    expect(table.files['/products/scarf/']).toEqual(scarfRow);
    expect(table.files['/products/scarf/index.html']).toEqual(scarfRow);
    expect(table.files[`/${STYLES}`]).toEqual({
      h: hexOf(manifest.files[STYLES]),
      t: 'text/css; charset=utf-8',
      c: 'immutable',
    });
  });

  it('шапка: магазин, сборка, версии рендера и темы; страницы 404 у темы нет — null', () => {
    const { table } = publish([HOME], 7);
    expect(table).toMatchObject({
      v: 1,
      shop: SHOP,
      build: 7,
      versions: { render: `sha256:${'1'.repeat(64)}`, theme: 'nova@0.0.1' },
      notFound: null,
      moved: {},
      gone: {},
    });
    expect(parseRoutesTable(table, 'routes/x/7.json')).toEqual(table);
  });

  it('страница 404 темы — отпечаток файла 404.html', () => {
    const { manifest } = buildOf([HOME], { '404.html': '<h1>Такой страницы нет</h1>' });
    const table = buildRoutesTable({ manifest, build: 1, previous: null, now: NOW });
    expect(table.notFound).toBe(hexOf(manifest.files['404.html']));
  });
});

describe('переезды (301) и удалённое (410)', () => {
  it('переименовали товар — старый адрес ведёт на новый', () => {
    const { table } = publish([HOME, WINTER], 2, publish([HOME, SCARF], 1));
    expect(table.moved).toEqual({ '/products/scarf/': '/products/scarf-winter/' });
    expect(table.gone).toEqual({});
  });

  it('удалили товар — 410 на полгода', () => {
    const { table } = publish([HOME], 2, publish([HOME, SCARF], 1));
    expect(table.gone).toEqual({ '/products/scarf/': '2027-04-08T12:00:00.000Z' });
    expect(GONE_DAYS).toBe(183);
  });

  it('убрали политику — обычная 404: её нет ни в переездах, ни в удалённом', () => {
    const { table } = publish([HOME], 2, publish([HOME, POLICY], 1));
    expect([table.moved, table.gone]).toEqual([{}, {}]);
  });

  it('у сайта убрали одну из страниц — не 301 на главную', () => {
    const { table } = publish([HOME], 2, publish([HOME, ABOUT], 1));
    expect([table.moved, table.gone]).toEqual([{}, {}]);
  });

  it('цепочка переездов — старый адрес ведёт сразу на последний', () => {
    const second = publish([HOME, WINTER], 2, publish([HOME, SCARF], 1));
    const { table } = publish([HOME, { ...SCARF, path: '/products/scarf-2027/' }], 3, second);
    expect(table.moved).toEqual({
      '/products/scarf/': '/products/scarf-2027/',
      '/products/scarf-winter/': '/products/scarf-2027/',
    });
  });

  it('товар переехал, потом его удалили — оба адреса отвечают 410', () => {
    const second = publish([HOME, WINTER], 2, publish([HOME, SCARF], 1));
    const { table } = publish([HOME], 3, second, '2026-11-01T00:00:00.000Z');
    expect(table.moved).toEqual({});
    expect(table.gone).toEqual({
      '/products/scarf/': '2027-05-03T00:00:00.000Z',
      '/products/scarf-winter/': '2027-05-03T00:00:00.000Z',
    });
  });

  it('410 держится до своей даты, потом адрес уходит из удалённого', () => {
    const second = publish([HOME], 2, publish([HOME, SCARF], 1));
    expect(publish([HOME], 3, second, '2027-01-01T00:00:00.000Z').table.gone).toEqual(second.table.gone);
    expect(publish([HOME], 3, second, '2027-04-09T00:00:00.000Z').table.gone).toEqual({});
  });

  it('адрес снова отдаётся — уходит из переездов и удалённого', () => {
    const first = publish([HOME, SCARF], 1);
    const renamed = publish([HOME, WINTER], 2, first);
    const removed = publish([HOME], 2, first);
    expect(publish([HOME, SCARF], 3, renamed).table.moved).toEqual({ '/products/scarf-winter/': '/products/scarf/' });
    expect(publish([HOME, SCARF], 3, removed).table.gone).toEqual({});
  });

  it('переезды по кругу без страницы — снимаются', () => {
    const first = publish([HOME], 1);
    const looped = { ...first, table: { ...first.table, moved: { '/x/': '/y/', '/y/': '/x/' } } };
    expect(publish([HOME], 2, looped).table.moved).toEqual({});
  });
});

describe('второй адрес записи (блок 8 «Секций и SDK», часть 8б)', () => {
  const ID = '00000000-0000-4000-8000-000000000101';
  const SHARF = { path: '/product/sharf', entity: `product:${ID}`, aliases: [`/product/${ID}`] };

  it('адрес по id — 301 на основной адрес, и у первой выкладки; файла по нему нет', () => {
    const { table } = publish([HOME, SHARF], 1);
    expect(table.moved).toEqual({ [`/product/${ID}`]: '/product/sharf' });
    expect(table.files[`/product/${ID}`]).toBeUndefined();
    expect(table.gone).toEqual({});
  });

  it('прошлая сборка без aliases (до части 8б) — адрес по id ведёт на основной адрес', () => {
    const before = { path: SHARF.path, entity: SHARF.entity };
    const { table } = publish([HOME, SHARF], 2, publish([HOME, before], 1));
    expect(table.moved).toEqual({ [`/product/${ID}`]: '/product/sharf' });
  });

  it('сменили адрес товара — старый адрес и адрес по id ведут на новый', () => {
    const renamed = { ...SHARF, path: '/product/sharf-nova' };
    const { table } = publish([HOME, renamed], 2, publish([HOME, SHARF], 1));
    expect(table.moved).toEqual({ '/product/sharf': '/product/sharf-nova', [`/product/${ID}`]: '/product/sharf-nova' });
  });

  it('удалили товар — оба адреса отвечают 410', () => {
    const { table } = publish([HOME], 2, publish([HOME, SHARF], 1));
    expect(table.moved).toEqual({});
    expect(Object.keys(table.gone).sort()).toEqual([`/product/${ID}`, '/product/sharf']);
  });
});

describe('страницы 404 и 502 платформы (блок 7 «Секций и SDK», часть 7а)', () => {
  it('502.html — хеш в unavailable; 404.html и 502.html по своему адресу не отдаются', () => {
    const { manifest } = buildOf([HOME], {
      '404.html': '<h1>Страница не найдена</h1>',
      '502.html': '<h1>Сайт временно недоступен</h1>',
    });
    const table = buildRoutesTable({ manifest, build: 1, previous: null, now: NOW });
    expect(table.unavailable).toBe(hexOf(manifest.files['502.html']));
    expect(table.notFound).toBe(hexOf(manifest.files['404.html']));
    expect(Object.keys(table.files)).not.toContain('/404.html');
    expect(Object.keys(table.files)).not.toContain('/502.html');
    expect(parseRoutesTable(table, 'routes/x/1.json')).toEqual(table);
  });

  it('сборка без 502.html — unavailable: null; таблица до части 7а, без ключа, читается', () => {
    const { table } = publish([HOME], 3);
    expect(table.unavailable).toBeNull();
    const old: Record<string, unknown> = { ...table };
    delete old.unavailable;
    expect(parseRoutesTable(old, 'routes/x/3.json')).toEqual(old);
  });
});

describe('политика CSP в таблице раздачи (блок 13 «Секций и SDK», часть 13б)', () => {
  const CSP = "default-src 'self'; object-src 'none'; base-uri 'none'";

  it('поле csp манифеста — в таблицу как есть; таблица читается обратно', () => {
    const { manifest } = buildOf([HOME]);
    const table = buildRoutesTable({ manifest: { ...manifest, csp: CSP }, build: 1, previous: null, now: NOW });
    expect(table.csp).toBe(CSP);
    expect(parseRoutesTable(JSON.parse(JSON.stringify(table)), 'routes/shop/1.json')).toEqual(table);
  });

  it('у манифеста без csp и в таблице поля нет', () => {
    const { manifest } = buildOf([HOME]);
    expect('csp' in buildRoutesTable({ manifest, build: 1, previous: null, now: NOW })).toBe(false);
  });

  it('csp с переводом строки — таблица не читается', () => {
    const { manifest } = buildOf([HOME]);
    const table = buildRoutesTable({ manifest, build: 1, previous: null, now: NOW });
    expect(() => parseRoutesTable({ ...table, csp: `${CSP}\r\nX-Evil: 1` }, 'routes/shop/1.json')).toThrow();
  });
});

describe('страница со списком в таблице раздачи (блок 11 «Секций и SDK», часть 11а)', () => {
  const CATALOG = { path: '/catalog/', entity: `site:${SHOP}`, list: { page: 1 } };

  it('страница со списком — l: true в строке её адреса и файла; страница без списка — без ключа l', () => {
    const { manifest, table } = publish([HOME, CATALOG, ABOUT], 1);
    expect(table.files['/catalog/']).toMatchObject({ l: true, m: UPDATED_AT, h: hexOf(manifest.pages[1].hash) });
    expect(table.files['/catalog/index.html']).toMatchObject({ l: true });
    expect(table.files['/about/']).not.toHaveProperty('l');
    expect(parseRoutesTable(table, 'routes/x/1.json')).toEqual(table);
  });

  it('схема таблицы принимает l: true и не принимает l: false и l: 1', () => {
    const { table } = publish([HOME], 1);
    const withList = { ...table, files: { ...table.files, '/': { ...table.files['/'], l: true } } };
    expect(parseRoutesTable(withList, 'routes/x/1.json')).toEqual(withList);
    expect(() =>
      parseRoutesTable({ ...table, files: { ...table.files, '/': { ...table.files['/'], l: false } } }, 'x'),
    ).toThrow();
    expect(() =>
      parseRoutesTable({ ...table, files: { ...table.files, '/': { ...table.files['/'], l: 1 } } }, 'x'),
    ).toThrow();
  });
});
