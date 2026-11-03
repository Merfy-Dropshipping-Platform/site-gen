import type { CheckoutDeliveryOption, CheckoutErrorKey, CheckoutField, CheckoutForm, CheckoutSettings } from './types';

// Поля и правила формы оформления (базовые секции, 03.11) — как у пяти тем на проде (CheckoutSubmit.canSubmit,
// CheckoutContactForm, CheckoutDeliveryForm): e-mail всегда; телефон — когда магазин требует вход и не выбрал «только
// почта»; имя — по режиму магазина; город и адрес — для физической доставки, кроме самовывоза и пункта выдачи.

export const CHECKOUT_FIELDS: readonly CheckoutField[] = [
  'email',
  'phone',
  'country',
  'firstName',
  'lastName',
  'city',
  'address',
  'postalCode',
];
export const DEFAULT_COUNTRY = 'Российская Федерация';

export const isCheckoutField = (value: unknown): value is CheckoutField =>
  CHECKOUT_FIELDS.some((field) => field === value);

export const emptyForm = (): CheckoutForm => ({
  values: {
    email: '',
    phone: '',
    country: DEFAULT_COUNTRY,
    firstName: '',
    lastName: '',
    city: '',
    address: '',
    postalCode: '',
  },
  errors: {},
});

// Настройки до ответа магазина и при сбое — полная форма, вход не обязателен (fail-open, как у пяти тем).
export const DEFAULT_SETTINGS: CheckoutSettings = {
  ready: false,
  phone: false,
  name: 'name-surname',
  address: true,
  signIn: false,
  offer: false,
};

const fieldOf = (source: unknown, key: string): unknown =>
  typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;

const NAME_MODES: readonly CheckoutSettings['name'][] = ['name', 'surname', 'name-surname'];
const nameModeOf = (value: unknown): CheckoutSettings['name'] =>
  NAME_MODES.find((mode) => mode === value) ?? 'name-surname';

// Ответ GET /public/sites/:id/settings → настройки формы. Телефон — только при обязательном входе и режиме не «e-mail»
// (владелец 28.09: «при необязательной регистрации телефона нет»).
export function settingsOf(settings: unknown): CheckoutSettings {
  const signIn = fieldOf(settings, 'requireCustomerAuth') === true;
  return {
    ready: true,
    phone: signIn && fieldOf(settings, 'contactMethod') !== 'email',
    name: nameModeOf(fieldOf(settings, 'customerNameMode')),
    address: fieldOf(settings, 'addressRequired') !== false,
    signIn,
    offer: false,
  };
}

// Телефон по-русски: +7 (999) 123-45-67; 8 в начале — 7; больше 11 цифр не берём.
export function phoneText(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits === '') return '';
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith('7')) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  const parts = [digits.slice(1, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)];
  const [code, first, second, third] = parts;
  let out = `+7 (${code}`;
  if (digits.length >= 4) out += ')';
  if (first !== '') out += ` ${first}`;
  if (second !== '') out += `-${second}`;
  if (third !== '') out += `-${third}`;
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Имя для заказа — из видимых полей по режиму магазина: «Имя Фамилия», «Имя» или «Фамилия».
export function customerName(values: CheckoutForm['values'], mode: CheckoutSettings['name']): string {
  if (mode === 'name') return values.firstName.trim();
  if (mode === 'surname') return values.lastName.trim();
  return `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
}

export interface Choice {
  readonly delivery: CheckoutDeliveryOption | null;
  readonly point: string | null;
  readonly payment: boolean; // способ оплаты выбран и магазин принимает оплату
  readonly house: boolean; // в адресе есть дом (подсказка DaData или раздельный ввод)
}

type Rule = (values: CheckoutForm['values']) => string | null;
const required =
  (field: CheckoutField, text: string): Rule =>
  (values) =>
    values[field].trim() === '' ? text : null;

// Нужен ли адрес: физическая доставка и способ не самовывоз и не пункт выдачи (пункты адрес-независимы).
const addressNeeded = (settings: CheckoutSettings, choice: Choice): boolean =>
  settings.address && choice.delivery?.kind !== 'pickup' && choice.delivery?.needsPoint !== true;

function fieldRules(settings: CheckoutSettings, choice: Choice): Partial<Record<CheckoutField, Rule>> {
  const rules: Partial<Record<CheckoutField, Rule>> = {
    email: (values) => {
      const email = values.email.trim();
      if (email === '') return 'Введите e-mail';
      return EMAIL.test(email) ? null : 'Проверьте e-mail: в нём нужны @ и точка';
    },
  };
  if (settings.phone || (settings.offer && settings.address))
    rules.phone = (values) =>
      values.phone.replace(/\D/g, '').length === 11 ? null : 'Введите номер телефона полностью';
  if (settings.name !== 'surname') rules.firstName = required('firstName', 'Введите имя');
  if (settings.name !== 'name') rules.lastName = required('lastName', 'Введите фамилию');
  if (addressNeeded(settings, choice)) {
    rules.city = required('city', 'Укажите город');
    rules.address = required('address', 'Укажите адрес');
  }
  return rules;
}

// Ошибки выборов: способ доставки, пункт выдачи, дом у курьера до двери, способ оплаты.
function choiceErrors(settings: CheckoutSettings, choice: Choice): Partial<Record<CheckoutErrorKey, string>> {
  const errors: Partial<Record<CheckoutErrorKey, string>> = {};
  const delivery = choice.delivery;
  if (settings.address && delivery === null) errors.delivery = 'Выберите способ доставки';
  if (delivery?.needsPoint === true && choice.point === null) errors.point = 'Выберите пункт выдачи';
  if (delivery?.kind === 'carrier' && !delivery.needsPoint && !choice.house)
    errors.address = 'Выберите адрес с номером дома из подсказки';
  if (!choice.payment) errors.payment = 'Выберите способ оплаты';
  return errors;
}

// Все ошибки формы при этих значениях, настройках и выборе.
export function formErrors(
  values: CheckoutForm['values'],
  settings: CheckoutSettings,
  choice: Choice,
): Partial<Record<CheckoutErrorKey, string>> {
  const errors: Partial<Record<CheckoutErrorKey, string>> = {};
  for (const [field, rule] of Object.entries(fieldRules(settings, choice))) {
    const text = rule(values);
    if (text !== null && isCheckoutField(field)) errors[field] = text;
  }
  // Пустой адрес — «Укажите адрес», а не «выберите дом»: ошибки полей поверх ошибок выбора.
  return { ...choiceErrors(settings, choice), ...errors };
}

// Видимые ошибки: только у полей, которые покупатель покинул, и у всех после «Оплатить» (shown — все).
export function visibleErrors(
  all: Partial<Record<CheckoutErrorKey, string>>,
  left: ReadonlySet<CheckoutErrorKey>,
  shown: boolean,
): Partial<Record<CheckoutErrorKey, string>> {
  return Object.fromEntries(Object.entries(all).filter(([key]) => shown || left.has(fieldKey(key))));
}

// Ключ ошибки: поле формы или выбор (доставка, пункт, оплата). Без массива-копии на верхнем уровне — его сборщик
// оставил бы в ядре каждой страницы.
const CHOICE_KEYS: readonly CheckoutErrorKey[] = ['delivery', 'point', 'payment'];
const fieldKey = (key: string): CheckoutErrorKey =>
  CHECKOUT_FIELDS.find((candidate) => candidate === key) ??
  CHOICE_KEYS.find((candidate) => candidate === key) ??
  'payment';
