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
