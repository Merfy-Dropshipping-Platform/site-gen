import { pickDefaultCombination } from "../../../packages/theme-base/runtime/nt-cart";

/**
 * «Быстрое добавление» кладёт ПЕРВЫЙ вариант — тот, что видит покупатель.
 *
 * Баг тестера 22.09 (пункт 27): «Из трёх оттенков кнопка „В корзину“ на
 * карточке кладёт Cold Brew, выбора не предлагает. Ожидаемо: взять первый».
 *
 * ЗАМЕР НА ЖИВОЙ ВИТРИНЕ (22.09), товар «Бесшовный топ»:
 *   порядок показа  Размер: XXS, XS, S | Цвет: Performance Pink, Cherry
 *                   Purple, Haze Pink
 *   combinations[0] {Цвет: Haze Pink, Размер: XS} — ПОСЛЕДНИЙ цвет
 * Прежний выбор брал первую доступную комбинацию, то есть именно её.
 */

const ГРУППЫ = [
  { name: "Размер", options: [{ value: "XXS" }, { value: "XS" }, { value: "S" }] },
  { name: "Цвет", options: [{ value: "Performance Pink" }, { value: "Cherry Purple" }, { value: "Haze Pink" }] },
];

/** Порядок комбинаций — как приходит с витрины, а не как показывают. */
const КОМБИНАЦИИ = [
  { id: "c1", options: { "Цвет": "Haze Pink", "Размер": "XS" }, available: true },
  { id: "c2", options: { "Размер": "XXS", "Цвет": "Haze Pink" }, available: true },
  { id: "c3", options: { "Цвет": "Performance Pink", "Размер": "XXS" }, available: true },
  { id: "c4", options: { "Цвет": "Cherry Purple", "Размер": "S" }, available: true },
];

describe("вариант по умолчанию для быстрого добавления", () => {
  it("берёт первые значения КАЖДОЙ группы, а не первую комбинацию", () => {
    expect(pickDefaultCombination(КОМБИНАЦИИ, ГРУППЫ)?.id).toBe("c3");
  });

  it("прежнее поведение выбрало бы другой вариант — иначе проверка пуста", () => {
    // Калибровка: первая доступная комбинация — это c1 (Haze Pink), и именно
    // она попадала в корзину.
    expect(КОМБИНАЦИИ.find((c) => c.available !== false)?.id).toBe("c1");
  });

  it("первый вариант недоступен — берём его же, но доступный", () => {
    const список = [
      { id: "a", options: { "Цвет": "Performance Pink", "Размер": "XXS" }, available: false },
      { id: "b", options: { "Цвет": "Performance Pink", "Размер": "XS" }, available: true },
    ];
    // Первые значения ОБЕИХ групп даёт только `a`, но он недоступен —
    // возвращаем его как единственное точное совпадение, чтобы карточка не
    // подменяла выбор покупателя молча.
    expect(pickDefaultCombination(список, ГРУППЫ)?.id).toBe("a");
  });

  it("без групп — прежний путь: первая доступная", () => {
    const список = [
      { id: "x", options: { "Цвет": "A" }, available: false },
      { id: "y", options: { "Цвет": "B" }, available: true },
    ];
    expect(pickDefaultCombination(список, null)?.id).toBe("y");
  });

  it("совпадения нет — прежний путь, а не пустота", () => {
    const список = [{ id: "z", options: { "Цвет": "Неизвестный" }, available: true }];
    expect(pickDefaultCombination(список, ГРУППЫ)?.id).toBe("z");
  });

  it("пустой список — null, без исключений", () => {
    expect(pickDefaultCombination([], ГРУППЫ)).toBeNull();
    expect(pickDefaultCombination(null, ГРУППЫ)).toBeNull();
  });
});
