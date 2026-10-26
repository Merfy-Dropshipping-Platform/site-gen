/**
 * Данные стенда «Моих заказов»: индивидуальный заказ И-2096 демо-магазина «Верстак» из
 * прототипа PM (specs/120-requests-v2/mockups/mock-data.json) в четырёх
 * состояниях. Блоки — дословный выход контейнера «Индивидуальных заказов» 0.29.0
 * (`src/v2/buyer-view.ts`: `buyerListItem`, `buyerEntry`) для этого заказа:
 * стенд и тесты проверяют тему на том, что реально придёт от расширения, а не
 * на выдуманной форме. Меняется только дата записи — «сегодня, 07:46» по
 * часам того, кто открыл стенд.
 */
import type {
  ContentBlock,
  EntryView,
  OrdersListItem,
  StatusTone,
} from "../../runtime/extension-orders-view";

export const STAND_STORE_ID = "verstak";
export const STAND_EXTENSION_ID = "test-ext";
export const STAND_LIST_FN = "mineListV2";
export const STAND_GET_FN = "mineGetV2";
export const STAND_RECORD_ID = "r2096";

export const STAND_STATES = ["new", "disc", "wait", "closed"] as const;
export type StandState = (typeof STAND_STATES)[number];

const NUMBER = "И-2096";
const TITLE = "Стол из массива по размеру";
const CREATED_HOURS = 7;
const CREATED_MINUTES = 46;

const STATUS: Record<StandState, { status: string; tone: StatusTone }> = {
  new: { status: "Отправлен", tone: "info" },
  disc: { status: "Обсуждаем", tone: "info" },
  wait: { status: "Ждёт оплаты", tone: "warning" },
  closed: { status: "Закрыт", tone: "neutral" },
};

const LETTERS_HEADING: ContentBlock = { type: "text", text: "Письма магазина" };

const ANSWERS: ContentBlock[] = [
  { type: "text", text: "Что вы заполнили" },
  {
    type: "pairs",
    rows: [
      { label: "Длина, см", value: "180" },
      { label: "Ширина, см", value: "90" },
      { label: "Порода дерева", value: "Дуб" },
      { label: "Покрытие", value: "Масло" },
      { label: "Фото комнаты", value: "3 файл." },
      { label: "Нужен замер", value: "Да" },
    ],
  },
];

const BLOCKS: Record<StandState, ContentBlock[]> = {
  new: [
    {
      type: "text",
      text: "Заказ у магазина\nМагазин посмотрит его и свяжется с вами",
    },
    LETTERS_HEADING,
    { type: "text", text: "Писем пока нет" },
    ...ANSWERS,
  ],
  disc: [
    {
      type: "text",
      text: "Магазин уточняет детали\nОтвет придёт на почту — он есть и ниже, в письмах",
    },
    LETTERS_HEADING,
    {
      type: "text",
      text: "Ваш индивидуальный заказ И-2096 в магазине «Верстак»\nсегодня, 07:50\n\nИгорь, здравствуйте! По фото видно, что стол лучше сделать на 10 см уже. Приедем на замер в субботу?",
    },
    ...ANSWERS,
  ],
  wait: [
    {
      type: "text",
      text: "Предложение готово\nПроверьте цену и срок и оплатите",
    },
    { type: "text", text: "Предложение магазина" },
    {
      type: "lines",
      rows: [
        { label: "Стол из дуба по вашим размерам × 1", value: "54 000 ₽" },
        { label: "Выезд на замер × 1", value: "1 500 ₽" },
      ],
      total: { label: "Итого", value: "55 500 ₽" },
    },
    { type: "text", text: "Срок: 21 день после оплаты." },
    { type: "text", text: "Сначала замер, потом в работу." },
    { type: "text", text: "Вещь делают под вас: без брака её нельзя вернуть." },
    {
      type: "button",
      label: "Перейти к оплате",
      url: "https://pay.example.ru/l/2096",
    },
    LETTERS_HEADING,
    {
      type: "text",
      text: "Предложение по индивидуальному заказу И-2096\nсегодня, 07:50\n\nПредложение отправлено: 55 500 ₽ · срок 21 день",
    },
    ...ANSWERS,
  ],
  closed: [
    { type: "text", text: "Заказ закрыт\nНет ответа" },
    LETTERS_HEADING,
    {
      type: "text",
      text: "Индивидуальный заказ И-2096 закрыт\nсегодня, 07:50\n\nЗаказ закрыт: Нет ответа",
    },
    ...ANSWERS,
  ],
};

/** Сегодня, 07:46 по часам браузера — ISO, как дату шлёт расширение. */
export function standDate(now: Date): string {
  const created = new Date(now);
  created.setHours(CREATED_HOURS, CREATED_MINUTES, 0, 0);
  return created.toISOString();
}

/** Строка «Моих заказов» — как `buyerListItem`. */
export function standItem(state: StandState, date: string): OrdersListItem {
  return {
    id: STAND_RECORD_ID,
    number: NUMBER,
    title: TITLE,
    ...STATUS[state],
    date,
  };
}

/** Страница записи — как `buyerEntry`. */
export function standEntry(state: StandState, date: string): EntryView {
  return {
    number: NUMBER,
    title: TITLE,
    ...STATUS[state],
    date,
    blocks: BLOCKS[state],
  };
}

export const isStandState = (value: unknown): value is StandState =>
  STAND_STATES.some((state) => state === value);
