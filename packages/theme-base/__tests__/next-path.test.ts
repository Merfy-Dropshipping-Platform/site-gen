/**
 * next-path — куда вести покупателя после входа по ссылке из письма
 * (`/verify?token=…&next=<путь>`, спека 120, 2.6 и 5.4). Только свой путь
 * сайта; чужой адрес и его маскировки — в кабинет.
 */
import { DEFAULT_NEXT_PATH, nextPathOf } from "../runtime/next-path";

describe("переход после входа", () => {
  it("свой путь из next — туда, вместе с параметрами", () => {
    expect(nextPathOf("?token=t&next=%2Faccount%2Forders")).toBe(
      "/account/orders",
    );
    expect(nextPathOf("?next=/account/entry%3Fext%3Da%26id%3D1")).toBe(
      "/account/entry?ext=a&id=1",
    );
  });

  it("нет next или он пустой — в кабинет", () => {
    expect(DEFAULT_NEXT_PATH).toBe("/account");
    expect(nextPathOf("?token=t")).toBe("/account");
    expect(nextPathOf("?next=")).toBe("/account");
    expect(nextPathOf("")).toBe("/account");
  });

  it.each([
    ["чужой сайт по //", "?next=%2F%2Fevil.example"],
    ["чужой сайт по /\\", "?next=%2F%5Cevil.example"],
    ["обратная косая внутри", "?next=%2Fa%5C..%5Cevil"],
    ["табуляция склеивает //", "?next=%2F%09%2Fevil.example"],
    ["перевод строки", "?next=%2F%0A%2Fevil.example"],
    ["https", "?next=https%3A%2F%2Fevil.example"],
    ["javascript", "?next=javascript%3Aalert(1)"],
    ["относительный путь", "?next=account"],
  ])("%s — в кабинет", (_name, search) => {
    expect(nextPathOf(search)).toBe("/account");
  });
});
