import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutDeliveryFormSchema = z.object({
  heading: z.string(),
  country: z.object({
    enabled: z.boolean(),
    default: z.string(),
    selectable: z.boolean(),
  }),
  nameField: z.object({
    enabled: z.boolean(),
    splitFirstLast: z.boolean(),
  }),
  cityDadata: z.boolean(),
  addressDadata: z.boolean(),
  indexAutoFill: z.boolean(),
  requiredFields: z.array(z.enum(['email', 'phone', 'name', 'city', 'address', 'index'])),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutDeliveryFormProps = z.infer<typeof CheckoutDeliveryFormSchema>;

export const CheckoutDeliveryFormPuckConfig: BlockPuckConfig<CheckoutDeliveryFormProps> = {
  label: 'Доставка',
  category: 'form',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    country: { type: 'object', label: 'Страна' },
    nameField: { type: 'object', label: 'Имя' },
    cityDadata: { type: 'boolean', label: 'DaData hints для города' },
    addressDadata: { type: 'boolean', label: 'DaData hints для адреса' },
    indexAutoFill: { type: 'boolean', label: 'Автоподстановка индекса' },
    requiredFields: {
      type: 'multiCheckbox',
      label: 'Обязательные поля',
      options: [
        { label: 'E-mail', value: 'email' },
        { label: 'Телефон', value: 'phone' },
        { label: 'Имя', value: 'name' },
        { label: 'Город', value: 'city' },
        { label: 'Адрес', value: 'address' },
        { label: 'Индекс', value: 'index' },
      ],
    },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Доставка',
    country: { enabled: true, default: 'Российская Федерация', selectable: true },
    nameField: { enabled: true, splitFirstLast: true },
    cityDadata: true,
    addressDadata: true,
    indexAutoFill: true,
    requiredFields: ['email', 'phone', 'name', 'city', 'address', 'index'],
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutDeliveryFormSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};
