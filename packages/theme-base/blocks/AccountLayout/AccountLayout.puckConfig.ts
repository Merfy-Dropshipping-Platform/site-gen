import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const AccountLayoutSchema = z.object({
  showGreeting: z.boolean(),
  sidebarPosition: z.enum(['left', 'right']),
  activePage: z.enum(['dashboard', 'orders', 'profile', 'settings', 'logout']),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type AccountLayoutProps = z.infer<typeof AccountLayoutSchema>;

export const AccountLayoutPuckConfig: BlockPuckConfig<AccountLayoutProps> = {
  label: 'Макет личного кабинета',
  category: 'layout',
  fields: {
    showGreeting: { type: 'switch', label: 'Приветствие' },
    sidebarPosition: { type: 'radio', label: 'Позиция меню' },
    activePage: { type: 'radio', label: 'Активная страница' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    showGreeting: true,
    sidebarPosition: 'left',
    activePage: 'dashboard',
    colorScheme: 1,
    padding: { top: 48, bottom: 48 },
  },
  schema: AccountLayoutSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 4 } },
};
