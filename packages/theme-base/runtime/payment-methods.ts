/**
 * Каталог способов оплаты для настроек блока «Платёжная система» — ЕДИНСТВЕННОЕ
 * место списка ключей в site-gen: схема блока, поле выбора в конструкторе,
 * значения по умолчанию и мега-блок «Оформление заказа» берут ключи и подписи
 * отсюда. Лежит в runtime/, а не в каталоге блока: сборка блоков
 * (`compile-astro-blocks.mjs`) переписывает импорт `../../runtime/X` для любого
 * блока, а импорт .ts из соседнего блока — нет.
 *
 * Правила не здесь. Хозяин списка ключей — контракт billing
 * (`SHOP_PAYMENT_METHODS`, образец `payment-methods.json`; копия образца лежит
 * в `__tests__/fixtures/payment-methods.json`, тест сверяет с ней каталог).
 * Какой способ можно предложить покупателю, решают НЕ значения по умолчанию и
 * не флаги темы, а:
 *   - настройка магазина — переключатель «Включён» в блоке;
 *   - платёжка магазина — billing отдаёт витрине `enabledMethods` в
 *     `payment-config/public` (декларация адаптера платёжки; у ЮKassa ещё и
 *     то, что подключено у продавца), блок прячет остальные. Поэтому по
 *     умолчанию включены все способы каталога.
 *
 * Здесь только то, что нужно для показа: подпись в списке выбора и подпись
 * способа на витрине по умолчанию.
 */
export const PAYMENT_METHOD_KEYS = [
  'bank_card',
  'sbp',
  'sberbank',
  'tinkoff_bank',
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

interface PaymentMethodCatalogEntry {
  /** Подпись в списке выбора типа способа (конструктор). */
  selectLabel: string;
  /** Подпись способа на витрине, пока продавец не изменил. */
  label: string;
}

export const PAYMENT_METHOD_CATALOG: Readonly<
  Record<PaymentMethodKey, PaymentMethodCatalogEntry>
> = {
  bank_card: { selectLabel: 'Банковская карта', label: 'Банковская карта' },
  sbp: { selectLabel: 'СБП', label: 'СБП (Система быстрых платежей)' },
  sberbank: { selectLabel: 'Sber Pay', label: 'Sber Pay' },
  tinkoff_bank: { selectLabel: 'T-Pay', label: 'T-Pay' },
};

/**
 * Источник доступности для полей способов в конструкторе (`availability` в puckConfig): список способов,
 * которые поддерживает платёжка магазина (`enabledMethods` публичного payment-config billing). Имя
 * зарегистрировано в реестре источников конструктора; конструктор помечает способы вне списка
 * «Не поддерживается платёжкой магазина». Витрина и так показывает только поддерживаемые.
 */
export const PAYMENT_METHODS_AVAILABILITY_SOURCE = 'shop.paymentMethods';

/** Варианты поля «Тип» в конструкторе — в порядке каталога. */
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_KEYS.map((key) => ({
  label: PAYMENT_METHOD_CATALOG[key].selectLabel,
  value: key,
}));

/** Значения по умолчанию: все способы каталога включены, решает платёжка магазина. */
export const DEFAULT_PAYMENT_METHODS = PAYMENT_METHOD_KEYS.map((key) => ({
  key,
  enabled: true,
  label: PAYMENT_METHOD_CATALOG[key].label,
}));
