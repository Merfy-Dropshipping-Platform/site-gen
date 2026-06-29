import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// CartSummary — disclaimer + total + checkout button (всё hardcoded по Figma
// 1:20942). Sidebar мерчанта — только { colorScheme, padding } per Figma 1:20841.
// Sub-elements (CartTotal, CartCheckoutButton) auto-rendered, click-to-edit
// показывает «Настройка недоступна» панель (per Figma 1:20819, 1:20830).

export const CartSummarySchema = z.object({
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Под-элементы дерева (Figma 1:20819 / 1:20830) — данных не несут, рендерятся
  // как «Настройка недоступна» при клике в outline. См. NAMED_SUBSECTIONS.CartSummary
  // в конструкторе. hiddenInMainPanel → не показываются в основной панели.
  cartTotals: z.unknown().optional(),
  cartCheckoutButton: z.unknown().optional(),
});

export type CartSummaryProps = z.infer<typeof CartSummarySchema>;

export const CartSummaryPuckConfig: BlockPuckConfig<CartSummaryProps> = {
  label: 'Промежуточный итог',
  category: 'content',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Под-элементы «Итоговая цена» / «Кнопка оформления заказа» (Figma 1:20819,
    // 1:20830): нередактируемые узлы дерева с плашкой «Настройка недоступна».
    cartTotals: {
      type: 'disabledHint',
      label: 'Итоговая цена',
      hiddenInMainPanel: true,
      hintTitle: 'Настройка недоступна',
      hintBody: 'Настраиваемые параметры отсутствуют',
    } as any,
    cartCheckoutButton: {
      type: 'disabledHint',
      label: 'Кнопка оформления заказа',
      hiddenInMainPanel: true,
      hintTitle: 'Настройка недоступна',
      hintBody: 'Настраиваемые параметры отсутствуют',
    } as any,
  },
  defaults: {
    colorScheme: 'scheme-2',
    padding: { top: 0, bottom: 80 },
  },
  schema: CartSummarySchema,
  maxInstances: 1,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
  },
};
