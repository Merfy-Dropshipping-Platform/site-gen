import { describe, expect, it } from 'vitest';
import { LIVE_PARTS, pageExtensions, pageParts } from '../src/code';
import { HERO } from './support-code';
import { EXT_META, REVIEWS, TEST_EXT, withReviews } from './support-ext';

// Описания расширений в конфиге страницы и часть ext в бандле (блок 9 «Секций и SDK», часть 9в; Р9в-20): расширения
// из meta.uses секций страницы — со скриптом и без; часть ext — по meta.parts механизмом части 5в.
const heroWith = (meta: typeof EXT_META) =>
  withReviews((inputs) => {
    inputs.code.sections = [REVIEWS, { ...HERO, meta }];
  });

describe('описания расширений для страницы', () => {
  it('конфиг страницы — только расширения из meta.uses секций этой страницы', () => {
    const inputs = withReviews();
    expect(pageExtensions(inputs, 'home')).toEqual({ 'test-ext': TEST_EXT });
    expect(pageExtensions(inputs, 'about')).toEqual({});
  });

  it('секция без скрипта с ext:test-ext в meta (метод — в разметке) — описание есть', () => {
    expect(pageExtensions(heroWith(EXT_META), 'about')).toEqual({ 'test-ext': TEST_EXT });
  });

  it('расширения нет в code.extensions (не включено) — в конфиге его нет', () => {
    const inputs = withReviews((changed) => {
      delete changed.code.extensions;
    });
    expect(pageExtensions(inputs, 'home')).toEqual({});
  });

  it('расширения — по алфавиту id, каждое один раз; чужие страницы и лишние описания не идут', () => {
    const empty = { stores: {}, methods: {} };
    const inputs = heroWith({ ...EXT_META, uses: ['ext:test-ext', 'ext:loyalty'] });
    inputs.code.extensions = { 'test-ext': TEST_EXT, unused: empty, loyalty: empty };
    inputs.code.pages = {
      home: [
        { id: 'reviews-1', section: REVIEWS.name, settings: {} },
        { id: 'hero-1', section: HERO.name, settings: {} },
      ],
    };
    expect(Object.keys(pageExtensions(inputs, 'home'))).toEqual(['loyalty', 'test-ext']);
  });
});

describe('часть ext в бандле страницы', () => {
  it('ext — по meta.parts секций страницы, после частей ядра и до аналитики; без такой meta — части нет', () => {
    const core = ['auth', 'cart', 'favorites'];
    expect(pageParts(core, [REVIEWS])).toEqual([...core, 'ext', ...LIVE_PARTS]);
    expect(pageParts(core, [HERO])).toEqual([...core, ...LIVE_PARTS]);
  });
});
