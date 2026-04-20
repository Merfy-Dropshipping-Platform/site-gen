import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const HeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay']),
  colorScheme: z.number().int().min(1).max(4),
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
    cta: { type: 'object', label: 'Кнопка' },
    variant: { type: 'radio', label: 'Вариант' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    title: 'Добро пожаловать',
    subtitle: '',
    image: { url: '', alt: '' },
    cta: { text: 'Смотреть каталог', href: '/catalog' },
    variant: 'centered',
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: HeroSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
