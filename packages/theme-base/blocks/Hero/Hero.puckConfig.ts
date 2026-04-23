import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Hero block — supports 4 variants:
 *   - centered  — single bg image + centered text (default)
 *   - split     — side-by-side image + text
 *   - overlay   — fullbleed bg image + overlay + centered text
 *   - grid-4    — 2x2 image grid + centered text (Rose-style collage)
 *
 * `image` is the canonical single-image shape (used by centered/split/overlay).
 * `images` is an optional array (4 items used by grid-4; falls back to repeating `image`).
 */
export const HeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(8).optional(),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay', 'grid-4']),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeroProps = z.infer<typeof HeroSchema>;

export const HeroPuckConfig: BlockPuckConfig<HeroProps> = {
  label: 'Hero',
  category: 'hero',
  fields: {
    title: { type: 'text', label: 'Заголовок' },
    subtitle: { type: 'text', label: 'Подзаголовок' },
    image: { type: 'object', label: 'Изображение' },
    images: { type: 'array', label: 'Сетка изображений (grid-4)' },
    cta: { type: 'object', label: 'Кнопка' },
    variant: { type: 'radio', label: 'Вариант' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    title: 'Добро пожаловать',
    subtitle: '',
    image: { url: '', alt: '' },
    images: undefined,
    cta: { text: 'Смотреть каталог', href: '/catalog' },
    variant: 'centered',
    padding: { top: 80, bottom: 80 },
  },
  schema: HeroSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
