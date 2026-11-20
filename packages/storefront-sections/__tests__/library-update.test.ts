import { describe, expect, it, vi } from 'vitest';
import { libraryLatestOf, type LibraryHistory } from '../src/library-history';
import {
  baseOf,
  basedOnProblem,
  declineUpdate,
  offerOf,
  sourceWithHash,
  updateOfferOf,
  updateOffersOf,
  type CopyRow,
} from '../src/library-update';

// Предложение обновить копию библиотечной секции (20.11): основа копии, условия предложения, отказ, проверка основы.
const FAQ = ['sha256:faq1', 'sha256:faq2', 'sha256:faq3', 'sha256:faq4'] as const;
const HERO_1 = 'sha256:hero1';
const HISTORY: LibraryHistory = {
  [FAQ[0]]: { name: 'faq', version: 1 },
  [FAQ[1]]: { name: 'faq', version: 2 },
  [FAQ[2]]: { name: 'faq', version: 3 },
  [FAQ[3]]: { name: 'faq', version: 4 },
  [HERO_1]: { name: 'hero', version: 1 },
};
const SHOP = '25669e80-6add-4fd5-b39d-b9065d2cc918';

const row = (sourceHash: string, patch: Partial<CopyRow> = {}): CopyRow => ({
  sourceHash,
  libraryBase: null,
  draft: false,
  ...patch,
});
// Копия, изменённая мерчантом: отпечаток правки не из истории.
const edited = (patch: Partial<CopyRow> = {}): CopyRow => row('sha256:merchant', { draft: true, ...patch });

describe('основа копии', () => {
  it('явная основа текущей правки', () => {
    expect(baseOf([edited({ libraryBase: FAQ[2] })], HISTORY)).toMatchObject({ name: 'faq', version: 3 });
  });

  it('нет явной — самая новая версия из истории среди отпечатков строк', () => {
    const rows = [row(FAQ[0]), row(FAQ[1]), edited()];
    expect(baseOf(rows, HISTORY)).toMatchObject({ hash: FAQ[1], version: 2 });
  });

  it('выпуск секции обновил копию без правок после явной основы — новее строка из истории', () => {
    const rows = [row(FAQ[3]), edited({ libraryBase: FAQ[1] })];
    expect(baseOf(rows, HISTORY)).toMatchObject({ version: 4 });
  });

  it('явная основа не из истории — как будто её нет', () => {
    expect(baseOf([row(FAQ[0]), edited({ libraryBase: 'sha256:unknown' })], HISTORY)).toMatchObject({ version: 1 });
  });

  it('ни явной основы, ни версий в истории — основы нет', () => {
    expect(baseOf([row('sha256:a'), edited()], HISTORY)).toBeUndefined();
  });

  it('версии разных секций не смешиваются: считается секция явной основы', () => {
    const rows = [row(HERO_1), edited({ libraryBase: FAQ[1] })];
    expect(baseOf(rows, HISTORY)).toMatchObject({ name: 'faq', version: 2 });
  });
});

describe('условия предложения', () => {
  it('копия изменена, основа старше версии в библиотеке — предложение с версиями', () => {
    expect(offerOf([row(FAQ[1]), edited()], undefined, HISTORY)).toMatchObject({
      name: 'faq',
      base: { hash: FAQ[1], version: 2 },
      latest: { hash: FAQ[3], version: 4 },
    });
  });

  it('последняя версия в предложении — максимальная версия секции в истории', () => {
    expect(libraryLatestOf('faq', HISTORY)).toMatchObject({ hash: FAQ[3], version: 4 });
    expect(libraryLatestOf('нет-такой', HISTORY)).toBeUndefined();
  });

  it('копия не изменена (отпечаток из истории) — её обновляет выпуск секции, предложения нет', () => {
    expect(offerOf([row(FAQ[1]), row(FAQ[1], { draft: true })], undefined, HISTORY)).toBeUndefined();
  });

  it('копия не наша (нет ни основы, ни версий из истории) — предложения нет', () => {
    expect(offerOf([row('sha256:own'), edited()], undefined, HISTORY)).toBeUndefined();
  });

  it('основа равна текущей версии — предложения нет', () => {
    expect(offerOf([edited({ libraryBase: FAQ[3] })], undefined, HISTORY)).toBeUndefined();
  });

  it('текущей правки нет (все строки сняты) — предложения нет', () => {
    expect(offerOf([row(FAQ[1])], undefined, HISTORY)).toBeUndefined();
  });

  it('копия под другим именем получает предложение по явной основе', () => {
    expect(offerOf([edited({ libraryBase: FAQ[0] })], undefined, HISTORY)).toMatchObject({ base: { version: 1 } });
  });

  it('отказ от версии 4 — молчит; отказ от версии 3 — новая версия 4 снова предлагается', () => {
    const rows = [edited({ libraryBase: FAQ[1] })];
    expect(offerOf(rows, 4, HISTORY)).toBeUndefined();
    expect(offerOf(rows, 3, HISTORY)).toMatchObject({ latest: { version: 4 } });
  });
});

// Подставка базы: ответы по виду запроса, записи — в журнал вызовов.
function dbOf(copies: unknown[], declines: unknown[] = [], sources: unknown[] = []) {
  const query = vi.fn((sql: string): Promise<{ rows: readonly unknown[] }> => {
    if (sql.startsWith('INSERT')) return Promise.resolve({ rows: [] });
    if (sql.includes('update_decline')) return Promise.resolve({ rows: declines });
    if (sql.includes('SELECT source ')) return Promise.resolve({ rows: sources });
    return Promise.resolve({ rows: copies });
  });
  return { query };
}
const stored = (name: string, sourceHash: string, libraryBase: string | null, draft: boolean): unknown => ({
  name,
  sourceHash,
  libraryBase,
  draft,
});
const COPIES = [
  stored('shop:faq', FAQ[1], null, false),
  stored('shop:faq', 'sha256:merchant', null, true),
  stored('shop:hero', HERO_1, null, true),
  stored('shop:own', 'sha256:own', null, true),
];

describe('предложения магазина', () => {
  it('по всем секциям: только изменённые копии с версией новее основы', async () => {
    const offers = await updateOffersOf(dbOf(COPIES), SHOP, HISTORY);
    expect([...offers.keys()]).toEqual(['shop:faq']);
    expect(offers.get('shop:faq')).toMatchObject({ base: { version: 2 }, latest: { version: 4 } });
  });

  it('отказ мерчанта берётся из таблицы отказов', async () => {
    const declines = [{ name: 'shop:faq', version: 4 }];
    expect((await updateOffersOf(dbOf(COPIES, declines), SHOP, HISTORY)).size).toBe(0);
  });

  it('одной секции — по имени', async () => {
    expect(await updateOfferOf(dbOf(COPIES), SHOP, 'shop:own', HISTORY)).toBeUndefined();
    expect(await updateOfferOf(dbOf(COPIES), SHOP, 'shop:faq', HISTORY)).toMatchObject({ name: 'faq' });
  });
});

describe('отказ', () => {
  it('записывает последнюю версию секции для этого магазина и имени', async () => {
    const db = dbOf(COPIES);
    const offer = await declineUpdate(db, SHOP, 'shop:faq', HISTORY);
    expect(offer?.latest.version).toBe(4);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO storefront_section_update_decline'),
      [SHOP, 'shop:faq', 4],
    );
  });

  it('предложения нет — ничего не пишет и отвечает undefined', async () => {
    const db = dbOf(COPIES);
    expect(await declineUpdate(db, SHOP, 'shop:own', HISTORY)).toBeUndefined();
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
});

describe('основа из строки магазина', () => {
  it('строка с этим отпечатком — её исходник; нет строки — null', async () => {
    const files = { 'section.json': '{}' };
    expect(await sourceWithHash(dbOf([], [], [{ source: files }]), SHOP, 'shop:faq', FAQ[1])).toEqual(files);
    expect(await sourceWithHash(dbOf([]), SHOP, 'shop:faq', FAQ[1])).toBeNull();
  });
});

describe('основа при сохранении (basedOn)', () => {
  const manifest = (name: string): string =>
    JSON.stringify({ sdk: 1, name, kind: 'section', title: 'Вопросы', settings: [] });
  const filesOf = (name: string): Record<string, string> => ({
    'section.json': manifest(name),
    'template.astro': '<div></div>',
  });
  const problem = (name: string, basedOn: string, copies: unknown[] = []) =>
    basedOnProblem(dbOf(copies), SHOP, filesOf(name), basedOn, HISTORY);

  it('отпечатка нет в истории — отказ', async () => {
    expect(await problem('faq', 'sha256:made-up')).toContain('нет в истории библиотеки');
  });

  it('версия секции с тем же именем — можно, у новой и у записанной секции', async () => {
    expect(await problem('faq', FAQ[1])).toBeNull();
    expect(await problem('faq', FAQ[1], [stored('shop:faq', 'sha256:merchant', null, true)])).toBeNull();
  });

  it('новая секция под другим именем — копия библиотечной (действие copy), основа принимается', async () => {
    expect(await problem('faq-copy', FAQ[1])).toBeNull();
  });

  it('у записанной секции чужая версия — отказ с именами обеих', async () => {
    const own = [stored('shop:my-section', 'sha256:own', null, true)];
    const text = await problem('my-section', FAQ[1], own);
    expect(text).toContain('«faq»');
    expect(text).toContain('«my-section»');
  });

  it('копия записана с основой секции faq — перенос с версией faq можно, с версией hero — нельзя', async () => {
    const copies = [stored('shop:faq-copy', 'sha256:merchant', FAQ[0], true)];
    expect(await problem('faq-copy', FAQ[3], copies)).toBeNull();
    expect(await problem('faq-copy', HERO_1, copies)).toContain('«hero»');
  });
});
