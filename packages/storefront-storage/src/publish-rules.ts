import type { StorefrontManifest } from '@merfy/storefront-build';

// Проверка перед переключением (design.md блока 5, раздел 4) — таблица правил. Манифест проходит схему раньше:
// checkManifest блока 4 в publishBuild. Правило не прошло — указатель не трогаем, тревогу шлёт тот, кто выкладывает
// (блок 6). Правило, у которого overridable, служебная команда может разрешить нарушить («переключить можно служебной
// командой, как откат»). Правило «есть страница 404» встанет, когда у темы будет страница 404 (план, «Чего нет»).

export interface PublishContext {
  manifest: StorefrontManifest;
  // Живая сборка до этой; первая выкладка — null.
  previous: StorefrontManifest | null;
  // Отпечатки, которых нет ни в хранилище, ни среди переданных файлов (заливка, upload.ts).
  missing: readonly string[];
}

export type PublishRuleId = 'files-present' | 'home-page' | 'products-not-gone';

export interface PublishRule {
  id: PublishRuleId;
  text: string;
  overridable: boolean;
  passes: (context: PublishContext) => boolean;
}

export interface PublishProblem {
  rule: PublishRuleId;
  text: string;
}

const productCount = (manifest: StorefrontManifest): number =>
  Object.keys(manifest.entities).filter((key) => key.startsWith('product:')).length;

// Товаров было больше нуля, а стало ноль — скорее сбой данных, чем решение мерчанта. В этапе товаров на стенде нет:
// правило есть, срабатывать ему не на чем.
const productsKept = ({ manifest, previous }: PublishContext): boolean =>
  previous === null || productCount(previous) === 0 || productCount(manifest) > 0;

export const PUBLISH_RULES: readonly PublishRule[] = [
  {
    id: 'files-present',
    text: 'не все файлы манифеста есть в хранилище',
    overridable: false,
    passes: (context) => context.missing.length === 0,
  },
  {
    id: 'home-page',
    text: 'нет главной страницы',
    overridable: true,
    passes: (context) => context.manifest.pages.some((page) => page.path === '/'),
  },
  { id: 'products-not-gone', text: 'товаров было больше нуля, а стало ноль', overridable: true, passes: productsKept },
];

export function publishProblems(context: PublishContext, allowed: readonly PublishRuleId[]): PublishProblem[] {
  const skipped = (rule: PublishRule): boolean => rule.overridable && allowed.includes(rule.id);
  const failed = PUBLISH_RULES.filter((rule) => !skipped(rule) && !rule.passes(context));
  return failed.map((rule) => ({ rule: rule.id, text: rule.text }));
}
