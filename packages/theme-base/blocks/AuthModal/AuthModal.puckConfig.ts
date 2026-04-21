import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const AuthModalSchema = z.object({
  mode: z.enum(['login', 'register', 'otp', 'closed']),
  siteTitle: z.string(),
  showSocialLogin: z.boolean(),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type AuthModalProps = z.infer<typeof AuthModalSchema>;

export const AuthModalPuckConfig: BlockPuckConfig<AuthModalProps> = {
  label: 'Окно авторизации',
  category: 'layout',
  fields: {
    mode: { type: 'radio', label: 'Режим' },
    siteTitle: { type: 'text', label: 'Название магазина' },
    showSocialLogin: { type: 'switch', label: 'Вход через соцсети' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    mode: 'closed',
    siteTitle: 'Мой магазин',
    showSocialLogin: false,
    colorScheme: 1,
    padding: { top: 32, bottom: 32 },
  },
  schema: AuthModalSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};
