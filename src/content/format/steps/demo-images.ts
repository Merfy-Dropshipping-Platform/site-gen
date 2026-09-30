/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Снятие демо-изображений сида там, где мерчант не тронул секцию.
 */

import type { Block, PageData } from "./types";

/**
 * Strip "designer demo" content from decorative image sections.
 *
 * theme.json `blockDefaults` seeded Hero/MultiRows/ImageWithText/Gallery/
 * Slideshow/Video with demo MinIO images (bag photos etc.). The theme ports
 * render a Figma empty-state placeholder ONLY when the section is empty — so
 * an untouched demo section showed the bag photo instead of the placeholder.
 *
 * Detection is by KNOWN demo URL (captured from blockDefaults across all 5
 * themes). If a decorative section still carries one of these demo images it
 * is considered untouched → its content props are stripped so the port falls
 * back to the Figma placeholder. ANY other image URL (a merchant upload) is
 * left intact. Idempotent: once stripped there is no demo URL left to match.
 */
const DEMO_IMAGE_URLS = new Set<string>([
  "https://minio.merfy.ru/product-images/113f237c-bc9d-4026-940f-362c34d5edef.png",
  "https://minio.merfy.ru/product-images/1352e026-ad8e-40e0-82ea-313f6d28f0a8.webp",
  "https://minio.merfy.ru/product-images/2174e491-b84a-4fe9-969b-03e7cfb4c6cb.png",
  "https://minio.merfy.ru/product-images/2bcd0822-b566-44b3-a973-024a544bd81b.png",
  "https://minio.merfy.ru/product-images/3d8e5b82-77b2-4a05-add9-d8b507b928de.png",
  "https://minio.merfy.ru/product-images/42581ed8-e00c-44f7-9554-3b180e2dbbf4.png",
  "https://minio.merfy.ru/product-images/493706c0-98af-4425-ba6b-5e4f4c451690.png",
  "https://minio.merfy.ru/product-images/5065b5f2-813a-482f-955f-79d59961781d.webp",
  "https://minio.merfy.ru/product-images/52a3d7a3-c4ef-4cee-839a-9c3cc4138d5f.webp",
  "https://minio.merfy.ru/product-images/5dd8c01f-5f9e-4e25-94e6-51a3f939f7c2.webp",
  "https://minio.merfy.ru/product-images/72b8fafa-5500-4547-b8c8-b1aeede1abe7.webp",
  "https://minio.merfy.ru/product-images/80db2fe6-9f38-4d7f-9be8-7b7a7377f8e1.png",
  "https://minio.merfy.ru/product-images/9e3891ac-1176-4963-a3ff-460111eec56e.webp",
  "https://minio.merfy.ru/product-images/a08a9591-3935-4083-aeb8-27a010b418f6.webp",
  "https://minio.merfy.ru/product-images/b6f44849-58b3-4ca7-9a29-6b0c77bec440.webp",
  "https://minio.merfy.ru/product-images/c02b5c8c-6b9b-4f32-9edb-7df26a953236.png",
  "https://minio.merfy.ru/product-images/c35a2f11-cc45-4e3c-9c1a-6fec10024a30.webp",
  "https://minio.merfy.ru/product-images/c7d5a251-242a-4796-b27d-ce6378b2f50c.png",
  "https://minio.merfy.ru/product-images/ca659a74-5488-435f-9884-64428bfe12af.webp",
  "https://minio.merfy.ru/product-images/cbcbb53f-b2ee-4e9d-87a9-54630568c5b1.webp",
  "https://minio.merfy.ru/product-images/cdc1fcbd-6e1e-4ac6-b734-5978ce57e2f5.png",
  "https://minio.merfy.ru/product-images/d237e918-2224-4823-a689-582ecda2e575.png",
  "https://minio.merfy.ru/product-images/d6b22fd7-98ea-40d6-ac2c-c5d4a17ded7e.webp",
  "https://minio.merfy.ru/product-images/d8d0bc51-183f-4509-b517-150066b71bad.png",
  "https://minio.merfy.ru/product-images/d95952a6-28e9-43d5-8702-160327f714e0.webp",
  "https://minio.merfy.ru/product-images/da44068b-c2be-4e68-8b2f-cbfd14df10e3.webp",
  "https://minio.merfy.ru/product-images/e901c239-7331-4421-854c-5cdbfd2200a7.png",
  "https://minio.merfy.ru/product-images/ebd21164-eabe-4eaa-ab34-a87716858be7.png",
  "https://minio.merfy.ru/product-images/f1f5ec7f-bf52-49fe-bf00-e46b15900881.webp",
  "https://minio.merfy.ru/product-images/f76f3053-7cfa-4823-894a-ce30fee3f1e0.png",
  "https://minio.merfy.ru/product-images/f92e309e-009c-4e15-85cc-87a59a439dea.png",
  "https://minio.merfy.ru/product-images/fa7923db-e2cd-4e1b-8353-d9a3650f2fb8.webp",
  "https://minio.merfy.ru/product-images/fbc737b0-c024-4b0a-8a8a-05dff445f628.webp",
  "https://minio.merfy.ru/product-images/ff8fdfad-e787-4884-91e4-68f2d9b24b68.png",
  "https://minio.merfy.ru/product-images/fff03c6b-af2d-4637-8b9a-83063c8f8155.webp",
]);

/**
 * Sections whose untouched designer-demo state → Figma placeholder. All carry a
 * known demo image in their default content (Hero/MultiColumns demo via the
 * shared c02b5c8c.png etc.), so the demo-URL match below catches them without
 * fragile text matching. Merchant-uploaded images (any other URL) keep the
 * section intact.
 */
const DEMO_IMAGE_SECTION_TYPES = new Set<string>([
  "Hero",
  "MultiRows",
  "ImageWithText",
  "Gallery",
  "Slideshow",
  "Video",
  "MultiColumns",
  // Collections only stripped when it carries a demo image (e.g. satin unsplash
  // covers with collectionId:null). Real picked collections use merchant/minio
  // covers → not matched → kept.
  "Collections",
]);

/** Content-bearing props stripped when a section is detected as untouched demo. */
const DEMO_CONTENT_PROPS = [
  "image",
  "imageUrl",
  "backgroundImage",
  "backgroundImages",
  "rows",
  "slides",
  "items",
  "tiles",
  "columns",
  "sections",
  "collections",
  "heading",
  "text",
  "title",
  "subtitle",
  "button",
  "primaryButton",
  "secondaryButton",
  "cta",
  "ctaText",
  "ctaUrl",
  "videoUrl",
  "poster",
  "content",
];

function valueContainsDemoImage(value: unknown): boolean {
  if (typeof value === "string") {
    // satin's theme defaults ship unsplash demo photos; any other host is
    // treated as a real merchant upload and left intact.
    return DEMO_IMAGE_URLS.has(value) || value.includes("images.unsplash.com");
  }
  if (Array.isArray(value)) return value.some(valueContainsDemoImage);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      valueContainsDemoImage,
    );
  }
  return false;
}

/** Prop keys that carry an actual media URL (as opposed to text/links). */
const IMAGE_LIKE_KEY = /image|poster|videourl/i;

/**
 * True when a NON-demo, non-empty media URL is present anywhere under an
 * image-bearing key (`image`/`imageUrl`/`backgroundImage(s)`/`poster`/
 * `videoUrl`), at any depth — including individual items of an array field
 * (Slideshow `slides`, Gallery/MultiRows/MultiColumns items/rows/columns).
 *
 * Bug (владелец 17.09, «Слайд-шоу — не применяется медиафайл в слайде»):
 * `valueContainsDemoImage` above walks the WHOLE block props and returns
 * true if ANY value anywhere still matches a known demo URL. A Slideshow
 * has up to 5 independent slides — a merchant routinely edits ONE slide and
 * leaves the rest on the untouched seed. `clearDemoImageSections` then
 * treated "some slide still has a demo photo" as "the whole section is
 * untouched" and deleted `props.slides` ENTIRELY, wiping the merchant's
 * freshly-picked image along with the untouched sibling's placeholder.
 * `keyHint` carries the enclosing object key down through arrays/objects so
 * plain text (heading/subtitle/button text) is never mistaken for a media
 * URL.
 */
function hasMerchantImage(value: unknown, keyHint?: string): boolean {
  if (typeof value === "string") {
    if (!keyHint || !IMAGE_LIKE_KEY.test(keyHint)) return false;
    const v = value.trim();
    if (!v) return false;
    return !(DEMO_IMAGE_URLS.has(v) || v.includes("images.unsplash.com"));
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasMerchantImage(item, keyHint));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) =>
      hasMerchantImage(v, k),
    );
  }
  return false;
}

export function clearDemoImageSections(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let mutated = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    const content = page?.content;
    if (!Array.isArray(content)) continue;
    let pageMutated = false;
    const newContent = content.map((b) => {
      if (!b || typeof b !== "object" || !b.type) return b;
      if (!DEMO_IMAGE_SECTION_TYPES.has(b.type)) return b;
      const props = b.props;
      if (!props || !valueContainsDemoImage(props)) return b;
      // A real merchant image somewhere in the block (e.g. one Slideshow
      // slide out of five) means the section is PARTIALLY edited, not
      // untouched demo seed — keep everything, don't wipe their choice.
      if (hasMerchantImage(props)) return b;
      const cleaned: Record<string, unknown> = { ...props };
      for (const p of DEMO_CONTENT_PROPS) delete cleaned[p];
      pageMutated = true;
      return { ...b, props: cleaned };
    });
    if (pageMutated) {
      out[pageId] = { ...(page as PageData), content: newContent };
      mutated = true;
    }
  }
  return mutated ? out : pagesData;
}
