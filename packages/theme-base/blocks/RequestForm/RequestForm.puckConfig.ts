import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * RequestForm — НЕ в палитре конструктора: секция встраивается в карточку
 * товара (Product.astro, проп `requestsEnabled`) по спеке 118 §5, а её состав
 * (поля, лимиты, телефон, кнопка) задаётся дескриптором @merfy/forms из
 * кабинета «Заявок» — мерчант не редактирует её как обычную секцию.
 * puckConfig существует только для анатомии блока (validateBlock требует
 * файл) и будущих встраиваний; поля скрыты из панели.
 */

// Constructor передаёт boolean-флаги строками "true"/"false" — принимаем обе формы.
const boolLike = z.union([z.boolean(), z.literal('true'), z.literal('false')]);

export const RequestFormSchema = z.object({
  /** Тумблер features.requests темы (спека §5). */
  requestsEnabled: boolLike.optional(),
  /** Товар, к которому относится заявка (в Product подставляется сам). */
  productId: z.string().optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type RequestFormProps = z.infer<typeof RequestFormSchema>;

export const RequestFormPuckConfig: BlockPuckConfig<RequestFormProps> = {
  label: 'Форма заявки',
  category: 'form',
  fields: {
    requestsEnabled: { type: 'toggle', label: 'Включена' } as any,
    productId: { type: 'text', label: 'Товар' } as any,
    colorScheme: { type: 'text', label: 'Цветовая схема' } as any,
    padding: {
      type: 'padding',
      label: 'Отступы',
    } as any,
  },
  defaults: {
    requestsEnabled: false,
    productId: '',
    padding: { top: 40, bottom: 40 },
  },
  schema: RequestFormSchema,
  maxInstances: null,
};
