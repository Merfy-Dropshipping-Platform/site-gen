import { z } from 'zod';

// Разбор ответов скриптов страницы (`browser/*.js`): страница чужая, поэтому каждое поле — со значением по умолчанию,
// а не доверие на слово. Что не разобралось, становится пустым, а не роняет задание.

const num = z.number().finite().catch(0);
const bool = z.boolean().catch(false);
const shortText = (max: number) =>
  z
    .string()
    .transform((value) => value.trim().slice(0, max))
    .nullable()
    .catch(null);

const boxSchema = z.object({ x: num, y: num, w: num, h: num }).catch({ x: 0, y: 0, w: 0, h: 0 });
const layoutSchema = z.enum(['image-left', 'image-right', 'centered', 'grid', 'unknown']).catch('unknown');

const domBlockSchema = z.object({
  tag: z.string().catch('div'),
  hint: z.string().catch(''),
  id: z.string().catch(''),
  box: boxSchema,
  heading: shortText(120),
  cards: num,
  images: num,
  form: bool,
  email: bool,
  fields: num,
  textarea: bool,
  video: bool,
  slides: num,
  fixed: bool,
  prices: num,
  links: num,
  details: num,
  text: z.string().catch(''),
  layout: layoutSchema,
  columns: num,
  iframeMap: bool,
});
export type DomBlock = z.infer<typeof domBlockSchema>;

const contourSchema = z.object({
  height: num,
  blocks: z.array(z.unknown()).catch([]),
});

export function parseDom(raw: unknown): { height: number; blocks: DomBlock[] } {
  const contour = contourSchema.catch({ height: 0, blocks: [] }).parse(raw);
  const blocks = contour.blocks
    .map((block) => domBlockSchema.safeParse(block))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  return { height: contour.height, blocks };
}

const probeSchema = z.object({
  title: z.string().catch(''),
  textLength: num,
  canvas: num,
  html: z.string().catch(''),
  google: z.array(z.string()).catch([]),
});
export type PageProbe = z.infer<typeof probeSchema>;

export const parseProbe = (raw: unknown): PageProbe =>
  probeSchema.catch({ title: '', textLength: 0, canvas: 0, html: '', google: [] }).parse(raw);
