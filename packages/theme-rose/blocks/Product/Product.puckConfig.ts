// Rose Product — использует базовый puckConfig (8-панельная подсистема PDP:
// text/title/price/variants/quantity/buttons/description/share + layout/size).
// Тема переопределяет только Astro-рендер (Product.astro — родная вёрстка rose:
// порт RoseProductDetail + живые данные товара + варианты). Puck-схема общая для
// всех тем, чтобы сайдбар конструктора показывал одинаковые настройки везде.
//
// Re-export держит блок-папку override в каноне анатомии
// (X.puckConfig / X.classes / X.tokens / index) и подхватывается preview
// puck-config loader'ом через theme-rose__Product__index.mjs (cascade override).
export {
  ProductPuckConfig,
  ProductSchema,
  type ProductProps,
} from "../../../theme-base/blocks/Product/Product.puckConfig";
