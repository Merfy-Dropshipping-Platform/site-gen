import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Bloom designer section «Преимущества» (themes/bloom/.../sections/Benefits.astro)
// ported into a packages block so it is editable in the constructor and seedable
// into a page revision. Render lives in Benefits.astro (self-contained).

const BenefitItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
});

export const BenefitsSchema = z.object({
  items: z.array(BenefitItemSchema).min(1).max(6),
  padding: z
    .object({
      top: z.number().int().min(0).max(160),
      bottom: z.number().int().min(0).max(160),
    })
    .optional(),
});

export type BenefitsProps = z.infer<typeof BenefitsSchema>;

// Designer defaults — verbatim from the bloom port.
export const BENEFITS_DEFAULT_ITEMS = [
  {
    id: 'benefit-1',
    title: 'Натуральные ингредиенты',
    description:
      'Подарите своей коже лучшее. Натуральные масла и экстракты в нашей косметике питают и восстанавливают, сохраняя вашу красоту естественно и безопасно.',
    icon: '/icons/benefit-1.png',
  },
  {
    id: 'benefit-2',
    title: 'Эксперты рекомендуют',
    description:
      'Выбор практикующих косметологов. Формула протестирована и рекомендована экспертами в области эстетической медицины. Доверьтесь профессионалам, которые знают о коже всё.',
    icon: '/icons/benefit-2.png',
  },
  {
    id: 'benefit-3',
    title: 'Качественный состав',
    description:
      'Безупречный состав: тщательно подобранные активные ингредиенты высшей очистки. Мы выбираем лучшее, чтобы ваша кожа получала идеальный уход каждый день.',
    icon: '/icons/benefit-3.png',
  },
];

export const BenefitsPuckConfig: BlockPuckConfig<BenefitsProps> = {
  label: 'Преимущества',
  category: 'content',
  fields: {
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    items: {
      type: 'array',
      label: 'Преимущества (макс 6)',
      hiddenInMainPanel: true,
      arrayFields: {
        title: { type: 'text', label: 'Заголовок' },
        description: { type: 'text', label: 'Описание' },
        icon: { type: 'image', label: 'Иконка' },
      },
      defaultItemProps: { id: '', title: '', description: '', icon: '' },
      max: 6,
    } as any,
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    items: BENEFITS_DEFAULT_ITEMS,
    padding: { top: 80, bottom: 120 },
  },
  schema: BenefitsSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
