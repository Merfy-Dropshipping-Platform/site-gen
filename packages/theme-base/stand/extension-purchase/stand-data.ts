/**
 * Данные стенда формы покупки: демо-магазин «Верстак» из прототипа PM
 * (specs/120-requests-v2/mockups/mock-data.json, freshCat). Здесь же лежит
 * перевод его формы (10 пунктов) в FormV2 — тот же вид, в каком форму отдаёт
 * расширение. Данные нужны стенду (stand.ts) и тестам рантайма: одна форма на
 * оба места, чтобы стенд и проверки не разошлись.
 */
import type { FormV2 } from "../../runtime/forms-vendor/types-v2";
import type {
  ProductFormView,
  ProductSubmitResult,
} from "../../runtime/extension-purchase";

export const STAND_STORE_ID = "verstak";
export const STAND_PRODUCT_ID = "p1";
export const STAND_EXTENSION_ID = "test-ext";
export const STAND_FORM_FN = "productFormV2";
export const STAND_SUBMIT_FN = "submitV2";

export const STAND_PRODUCT = {
  name: "Стол из массива по размеру",
  price: "от 39 000 ₽",
} as const;

export const VERSTAK_FORM: FormV2 = {
  version: 2,
  items: [
    {
      id: "f40",
      kind: "field",
      type: "number",
      title: "Длина, см",
      visible: true,
      required: true,
    },
    {
      id: "f41",
      kind: "field",
      type: "number",
      title: "Ширина, см",
      visible: true,
      required: true,
    },
    {
      id: "f42",
      kind: "field",
      type: "buttons",
      title: "Порода дерева",
      visible: true,
      required: true,
      options: ["Дуб", "Ясень", "Орех"],
    },
    {
      id: "f43",
      kind: "field",
      type: "select",
      title: "Покрытие",
      visible: true,
      required: true,
      options: ["Масло", "Лак"],
    },
    {
      id: "f44",
      kind: "field",
      type: "photo",
      title: "Фото комнаты",
      visible: true,
      required: false,
      maxFiles: 5,
    },
    {
      id: "f45",
      kind: "field",
      type: "checkbox",
      title: "Нужен замер",
      visible: true,
      required: false,
    },
    {
      id: "c-name",
      kind: "contact",
      key: "name",
      title: "Имя",
      visible: true,
      required: true,
    },
    {
      id: "c-email",
      kind: "contact",
      key: "email",
      title: "Почта",
      visible: true,
      required: true,
    },
    {
      id: "c-phone",
      kind: "contact",
      key: "phone",
      title: "Телефон",
      visible: true,
      required: false,
    },
    {
      id: "c-social",
      kind: "contact",
      key: "social",
      title: "Соцсеть или Telegram",
      visible: true,
      required: false,
    },
  ],
};

export const VERSTAK_FORM_VIEW: ProductFormView = {
  title: "Оставить заявку",
  submitLabel: "Оставить заявку",
  hint: "Платить сейчас не нужно. Ответ придёт на почту и в «Мои заказы».",
  priceNote: "точную цену назовём после заявки",
  form: VERSTAK_FORM,
};

/** Пример из прототипа (phoneFilled): что покупатель вводит в `?state=filled`. */
export const VERSTAK_SAMPLE = {
  fields: { f40: "180", f41: "90", f43: "Масло" },
  buttons: { f42: "Дуб" },
  checks: ["f45"],
  contacts: { name: "Игорь", email: "igor@example.ru", social: "@igor.belov" },
} as const;

/** Три фото комнаты для `?state=files` (эталон ph-product-form-files): цвета плиток прототипа. */
export const STAND_PHOTOS = {
  field: "f44",
  files: [
    { name: "room-1.png", color: "#E8A27A" },
    { name: "room-2.png", color: "#7FBFB5" },
    { name: "room-3.png", color: "#D4A0B4" },
  ],
} as const;

export const VERSTAK_SENT: ProductSubmitResult = {
  title: "Заявка №2096 отправлена",
  text: "Ответ придёт на почту, заявка видна в «Моих заказах».",
  buttons: [
    { label: "Открыть заявку", url: "/account/orders" },
    { label: "В каталог", url: "/catalog" },
  ],
};
