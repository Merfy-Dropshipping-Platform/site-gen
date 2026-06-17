// Rose Product — re-export базовых классов (анатомия блока). Родной рендер
// Product.astro держит rose-классы инлайн (порт RoseProductDetail), но баррель
// экспортирует базовый ProductClasses для совместимости подписи блок-папки.
export { ProductClasses } from "../../../theme-base/blocks/Product/Product.classes";
