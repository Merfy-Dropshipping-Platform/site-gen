import { at, list, text } from './design-pick';
import type { OwnBlock, OwnContent, OwnItem } from './design-types';

// Содержимое своего сайта мерчанта (`OwnContent`, только при `owned: true`) из ответа `browser/content.js`. Страница
// чужая — каждое поле проверяется и режется по длине; картинки — только абсолютные https (их перезальёт к нам
// merfy-mcp), ссылки меню — только http(s).

const HEADING_MAX = 300;
const TEXT_MAX = 2000;
const LABEL_MAX = 60;

const clip = (value: unknown, max: number): string | null => {
  const found = text(value);
  return found === null ? null : found.slice(0, max);
};

export function httpsUrl(value: unknown): string | null {
  const found = text(value);
  if (found === null || !URL.canParse(found)) return null;
  const url = new URL(found);
  return url.protocol === 'https:' ? url.href : null;
}

function webUrl(value: unknown): string | null {
  const found = text(value);
  if (found === null || !URL.canParse(found)) return null;
  return ['http:', 'https:'].includes(new URL(found).protocol) ? new URL(found).href : null;
}

const unique = (values: Array<string | null>): string[] => [...new Set(values.filter((value) => value !== null))];

const itemOf = (raw: unknown): OwnItem => ({
  heading: clip(at(raw, 'heading'), HEADING_MAX),
  text: clip(at(raw, 'text'), TEXT_MAX),
  image: httpsUrl(at(raw, 'image')),
});

function blockOf(raw: unknown, index: number): OwnBlock {
  return {
    index,
    heading: clip(at(raw, 'heading'), HEADING_MAX),
    text: clip(at(raw, 'text'), TEXT_MAX),
    buttons: list(at(raw, 'buttons')).flatMap((button) => clip(button, LABEL_MAX) ?? []),
    items: list(at(raw, 'items')).map(itemOf),
    images: unique(list(at(raw, 'images')).map(httpsUrl)),
  };
}

function menuOf(raw: unknown): OwnContent['menu'] {
  return list(raw).flatMap((entry) => {
    const label = clip(at(entry, 'label'), LABEL_MAX);
    const href = webUrl(at(entry, 'href'));
    return label === null || href === null ? [] : [{ label, href }];
  });
}

// Номер блока — номер в контуре (тот же порядок блоков); блоков больше, чем в контуре, — лишние отбрасываются.
export function parseContent(raw: unknown, blocks: number): OwnContent {
  return {
    v: 1,
    logo: httpsUrl(at(raw, 'logo')),
    menu: menuOf(at(raw, 'menu')),
    blocks: list(at(raw, 'blocks'))
      .slice(0, blocks)
      .map((block, index) => blockOf(block, index)),
  };
}

export const EMPTY_CONTENT: OwnContent = { v: 1, logo: null, menu: [], blocks: [] };
