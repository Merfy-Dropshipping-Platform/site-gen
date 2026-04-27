import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const LinkSchema = z.object({ label: z.string(), url: z.string() });

export const CheckoutTermsSchema = z.object({
  text: z.string(),
  links: z.array(LinkSchema),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutTermsProps = z.infer<typeof CheckoutTermsSchema>;

const defaultText =
  'Размещая заказ, вы соглашаетесь с [Условиями обслуживания](/legal/terms), [Политикой конфиденциальности](/legal/privacy) и [Политикой использования файлов cookie](/legal/cookies).';

export const CheckoutTermsPuckConfig: BlockPuckConfig<CheckoutTermsProps> = {
  label: 'Условия',
  category: 'content',
  fields: {
    text: { type: 'textarea', label: 'Текст (поддерживает [текст](url))' },
    links: {
      type: 'array',
      label: 'Дополнительные ссылки',
      itemFields: {
        label: { type: 'text', label: 'Название' },
        url: { type: 'text', label: 'URL' },
      },
    },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    text: defaultText,
    links: [
      { label: 'Условия обслуживания', url: '/legal/terms' },
      { label: 'Политика конфиденциальности', url: '/legal/privacy' },
      { label: 'Политика использования файлов cookie', url: '/legal/cookies' },
    ],
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutTermsSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};
