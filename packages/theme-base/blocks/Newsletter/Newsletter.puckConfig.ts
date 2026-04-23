import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const NewsletterSchema = z.object({
  heading: z.string(),
  description: z.string().optional(),
  placeholder: z.string(),
  buttonText: z.string(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type NewsletterProps = z.infer<typeof NewsletterSchema>;

export const NewsletterPuckConfig: BlockPuckConfig<NewsletterProps> = {
  label: 'Подписка',
  category: 'form',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    description: { type: 'text', label: 'Описание' },
    placeholder: { type: 'text', label: 'Плейсхолдер' },
    buttonText: { type: 'text', label: 'Кнопка' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Подпишись на новости',
    description: 'Узнавай о новинках и акциях первым',
    placeholder: 'Твой email',
    buttonText: 'Подписаться',
    padding: { top: 80, bottom: 80 },
  },
  schema: NewsletterSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
