import { describe, expect, it } from 'vitest';
import { copyAction, type ShopCopy } from '../../src/release/section';

// Что команда делает с копией нашей секции (блок 15, часть 15з, Р15з-3, Р15з-4): known — хеши исходника наших версий
// из истории git и новой версии.
const OLD = 'sha256:old';
const NEXT = 'sha256:next';
const MINE = 'sha256:merchant';
const KNOWN: ReadonlySet<string> = new Set([OLD, NEXT]);
const copy = (fields: Partial<ShopCopy>): ShopCopy => ({
  siteId: 's',
  published: true,
  draft: OLD,
  live: OLD,
  hashes: [OLD],
  ...fields,
});

describe('копия нашей секции', () => {
  it.each([
    ['наша прежняя версия — обновить', copy({}), 'update'],
    ['наша версия не на витрине — обновить', copy({ live: null }), 'update'],
    ['текущая — новая, на витрине прежняя — ждёт волны', copy({ draft: NEXT, hashes: [OLD, NEXT] }), 'pending'],
    ['новая и на витрине — уже на новой', copy({ draft: NEXT, live: NEXT, hashes: [NEXT] }), 'already'],
    ['текущая — правка мерчанта поверх нашей', copy({ draft: MINE, hashes: [OLD, MINE] }), 'changed'],
    ['своя секция мерчанта с тем же именем', copy({ draft: MINE, live: MINE, hashes: [MINE] }), 'not-ours'],
    ['на витрине — правка мерчанта, текущая — наша', copy({ live: MINE, hashes: [OLD, MINE] }), 'live-changed'],
    ['текущей правки нет', copy({ draft: null, live: null }), 'changed'],
  ] as const)('%s', (_title, input, action) => {
    expect(copyAction(input, KNOWN, NEXT)).toBe(action);
  });
});
