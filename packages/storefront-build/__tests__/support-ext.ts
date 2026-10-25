import type { BuildInputs, CodeSection } from '../src/inputs';
import { BADGE, HERO, codeInputs } from './support-code';

// Код магазина с секцией «Отзывы» тестового расширения «Отзывы-тест» (test-ext) — тесты блока 9 «Секций и SDK», часть
// 9в: meta секции — как его пишет приём (script_meta части 5в), описание test-ext — в code.extensions.
export const TEST_EXT = {
  stores: { summary: { fn: 'shopSummary' }, rating: { fn: 'productRating', by: 'product' as const } },
  methods: { vote: { fn: 'voteReview', params: ['review-id'] } },
};
export const EXT_META = { uses: ['ext:test-ext'], parts: ['ext'], classes: [] };
// Скрипт и модуль рендера — от «Значка корзины» (support-code.ts).
export const REVIEWS: CodeSection = { ...BADGE, name: 'shop:reviews', meta: EXT_META };

// Входы с ядром: «Отзывы» — на главной, «Первый экран» (без скрипта и без meta) — на странице about.
export function withReviews(edit: (inputs: BuildInputs) => void = () => undefined): BuildInputs {
  return codeInputs((inputs) => {
    inputs.code = {
      sections: [REVIEWS, HERO],
      pages: {
        home: [{ id: 'reviews-1', section: REVIEWS.name, settings: {} }],
        about: [{ id: 'hero-1', section: HERO.name, settings: {} }],
      },
      globals: [],
      extensions: { 'test-ext': TEST_EXT },
    };
    edit(inputs);
  });
}
