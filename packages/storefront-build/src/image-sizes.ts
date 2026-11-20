import { buildSrcset, variantKey, type Marker, type VariantKind } from '@merfy-dropshipping-platform/images';
import { valueOf, type HtmlTag } from './html-tags';
import { imgTags } from './image-loading';
import { imageKeyOf } from './image-urls';
import type { BuildInputs } from './inputs';
import type { PageContent } from './sections-render';

// Копии картинок по экрану (модуль картинок Merfy, шаг 3). Сервисы product и sites рядом с оригиналом кладут до трёх
// копий (`<ключ>.s.webp` — 400 px, `<ключ>.m.webp` — 800 px, `<ключ>.d.webp` — до 1600 px; версия правил 2, маркеры
// версии 1 без `s` читаются как раньше) и маркер `<ключ>.v.json`; сборка читает маркеры во входы
// (images) и ставит у <img> нашего хранилища srcset, браузер сам берёт копию по экрану:
// - src остаётся оригиналом: его читают поисковики, он же в og:image и предзагрузке без srcset;
// - нет маркера в images — нет копий: <img> как есть, битой картинки не бывает (маркер пишется последним);
// - шаблон главнее: свой srcset автора остаётся целиком, свой sizes — тоже (srcset тогда добавляется к нему);
// - внешние адреса, <source> и background-image не трогаются.
// Порядок в сборке страницы — перед порядком загрузки (image-loading.ts): предзагрузка главной картинки переносит
// srcset и sizes из <img>, и ссылка в <head> получает imagesrcset и imagesizes.

type Images = NonNullable<BuildInputs['images']>;

// sizes по умолчанию: на телефоне картинка занимает до 266 px, на других экранах — всю ширину. Число 266 — не размер
// слота, а порог выбора: у телефона с DPR 3 нужная ширина 266 × 3 = 798 px, и браузер берёт копию 800, а не 1600 (слот в
// 100vw при ширине 390 px и DPR 3 дал бы 1170 px и копию 1600). Телефоны с DPR 2 берут 800 с запасом. Планшет и
// компьютер — слот 100vw, копия 1600; карточкам сеток шаблон ставит свой sizes по числу колонок.
export const DEFAULT_SIZES = '(max-width: 767px) 266px, 100vw';

const hasAttribute = (tag: HtmlTag, name: string): boolean =>
  tag.attributes.some((attribute) => attribute.name === name);

// Маркер с ключами копий от ключа оригинала: имена копий известны правилом модуля, а то, как сервис записал ключ в
// маркер (с бакетом или без), на адрес не влияет.
const withCopyKeys = (marker: Marker, key: string): Marker => ({
  ...marker,
  variants: marker.variants.map((variant) => ({ ...variant, key: variantKey(key, variant.kind) })),
});

// Какие копии идут в srcset, смотря на то, кто назвал размер показа. Маленькая копия (400w) — только при своём sizes
// автора: он честно называет долю экрана (карточки сеток 50vw/25vw). У sizes сборки число 266 — порог выбора между 800 и
// 1600, а не ширина показа: рядом с кандидатом 400 браузер берёт меньшего при среднем геометрическом плотностей выше DPR
// (400w и 800w: 1,5 и 3,0 → 2,12 > 1,75), и обложка во всю ширину телефона рисовалась бы из 400 px.
const SIZES_OWNER = { own: 'own', build: 'build' } as const;
type SizesOwner = (typeof SIZES_OWNER)[keyof typeof SIZES_OWNER];
const KINDS_IN_SRCSET: Record<SizesOwner, readonly VariantKind[]> = {
  own: ['s', 'm', 'd'],
  build: ['m', 'd'],
};

// Маркер только с теми копиями, что нужны этому <img>.
const withKinds = (marker: Marker, kinds: readonly VariantKind[]): Marker => ({
  ...marker,
  variants: marker.variants.filter((variant) => kinds.includes(variant.kind)),
});

// Значение srcset для адреса картинки: копии — на хосте хранилища контура, оригинал — по своему адресу (в конце, если
// копии для компьютера нет). Нет маркера, нужных копий или ключа — пустая строка.
function srcsetOf(url: string, images: Images, owner: SizesOwner): string {
  const marker = images.markers[url];
  const key = imageKeyOf(url);
  if (marker === undefined || key === null) return '';
  const needed = withKinds(withCopyKeys(marker, key), KINDS_IN_SRCSET[owner]);
  if (needed.variants.length === 0) return '';
  const toUrl = (copyKey: string): string => (copyKey === key ? url : `${images.origin}/${copyKey}`);
  return buildSrcset({ key, marker: needed, toUrl });
}

// Атрибуты, которые сборка добавляет к <img>: srcset и, если автор не задал свой, sizes.
function sizeAttributes(tag: HtmlTag, images: Images): string {
  if (hasAttribute(tag, 'srcset')) return '';
  const owner = hasAttribute(tag, 'sizes') ? SIZES_OWNER.own : SIZES_OWNER.build;
  const srcset = srcsetOf(valueOf(tag.attributes, 'src'), images, owner);
  if (srcset === '') return '';
  const sizes = owner === SIZES_OWNER.own ? '' : ` sizes="${DEFAULT_SIZES}"`;
  return ` srcset="${srcset}"${sizes}`;
}

// Разметка с вставками по позициям (позиции — по возрастанию, как идут теги).
function withInsertions(html: string, insertions: readonly { at: number; text: string }[]): string {
  let out = '';
  let from = 0;
  for (const { at, text } of insertions) {
    out += html.slice(from, at) + text;
    from = at;
  }
  return out + html.slice(from);
}

// Разметка секции, у <img> нашего хранилища с копиями — srcset и sizes.
export function withImgSizes(html: string, images: Images): string {
  const insertions = imgTags(html)
    .map((tag) => ({ at: tag.insertAt, text: sizeAttributes(tag, images) }))
    .filter(({ text }) => text !== '');
  return insertions.length === 0 ? html : withInsertions(html, insertions);
}

// Разметка страницы: шапка, секции, подвал и окна. Нет маркеров (images не задан) — как есть.
export function withImageSizes(content: PageContent, images: BuildInputs['images']): PageContent {
  if (images === undefined) return content;
  const sized = (list: readonly string[] | undefined): string[] | undefined =>
    list?.map((html) => withImgSizes(html, images));
  return {
    ...content,
    sections: content.sections.map((html) => withImgSizes(html, images)),
    ...(content.header === undefined ? {} : { header: sized(content.header) }),
    ...(content.footer === undefined ? {} : { footer: sized(content.footer) }),
    ...(content.overlay === undefined ? {} : { overlay: sized(content.overlay) }),
  };
}
