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

// Без разметки ссылок: названия документов становятся ссылками на
// заполненные политики продавца по общему правилу (runtime/legal-links.ts).
// Та же строка, что DEFAULT_LEGAL_TEXT правила (сторож — legal-text-links.spec).
const defaultText =
  'Размещая заказ, вы соглашаетесь с Условиями обслуживания, Политикой конфиденциальности и Политикой использования файлов cookie.';

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
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    text: defaultText,
    // Поле «Дополнительные ссылки» остаётся; документы продавца сюда больше
    // не кладём (их ставит правило), `/legal/cookies` не существует.
    links: [],
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutTermsSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};
