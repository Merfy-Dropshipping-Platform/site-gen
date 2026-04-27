import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutContactFormSchema = z.object({
  heading: z.string(),
  showAuthLink: z.boolean(),
  authLinkText: z.string(),
  authLinkHref: z.string(),
  emailLabel: z.string(),
  phoneLabel: z.string(),
  phoneFormat: z.enum(['ru', 'intl']),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutContactFormProps = z.infer<typeof CheckoutContactFormSchema>;

export const CheckoutContactFormPuckConfig: BlockPuckConfig<CheckoutContactFormProps> = {
  label: 'Контакты',
  category: 'form',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    showAuthLink: { type: 'boolean', label: 'Показать ссылку «Войти»' },
    authLinkText: { type: 'text', label: 'Текст ссылки авторизации' },
    authLinkHref: { type: 'text', label: 'URL авторизации' },
    emailLabel: { type: 'text', label: 'Лейбл E-mail' },
    phoneLabel: { type: 'text', label: 'Лейбл телефона' },
    phoneFormat: {
      type: 'radio',
      label: 'Формат телефона',
      options: [
        { label: 'РФ (+7)', value: 'ru' },
        { label: 'Международный', value: 'intl' },
      ],
    },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Контакты',
    showAuthLink: true,
    authLinkText: 'Войти в аккаунт',
    authLinkHref: '/login?next=/checkout',
    emailLabel: 'E-mail',
    phoneLabel: 'Номер телефона',
    phoneFormat: 'ru',
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutContactFormSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};
