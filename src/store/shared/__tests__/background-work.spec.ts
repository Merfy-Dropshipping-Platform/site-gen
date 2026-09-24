/**
 * Общие мелочи команд этапа 3: текст ошибки и фоновая работа с пределом
 * ожидания. Раньше каждая команда держала свою копию (`messageOf`/`reasonOf`,
 * `delay`, набор фоновых обещаний) — ревью М2.
 */
import { BackgroundWork, delay, within } from "../background-work";
import { errorMessage } from "../error-message";

describe("errorMessage", () => {
  it.each([
    [new Error("REG.RU timeout"), "REG.RU timeout"],
    ["строка", "строка"],
    [42, "42"],
    [null, "null"],
  ])("%p → %p", (e, text) => {
    expect(errorMessage(e)).toBe(text);
  });
});

describe("BackgroundWork", () => {
  function make() {
    const logger = { error: jest.fn() };
    return { logger, work: new BackgroundWork(logger, "фоновый проход") };
  }

  it("start: результат работы; ошибка — в лог и undefined, наружу не летит", async () => {
    const { logger, work } = make();

    await expect(work.start(Promise.resolve(7))).resolves.toBe(7);
    await expect(
      work.start(Promise.reject(new Error("boom"))),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("фоновый проход: boom");
  });

  it("settle ждёт всё запущенное, включая начатое по ходу ожидания", async () => {
    const { work } = make();
    const done: string[] = [];
    void work.start(
      delay(5).then(() => {
        done.push("first");
        void work.start(delay(5).then(() => done.push("second")));
      }),
    );

    await work.settle();

    expect(done).toEqual(["first", "second"]);
  });
});

describe("within", () => {
  it("успела — её результат; не успела — значение по таймауту", async () => {
    await expect(within(Promise.resolve("ok"), 1_000, "timeout")).resolves.toBe(
      "ok",
    );
    await expect(
      within(new Promise(() => undefined), 10, "timeout"),
    ).resolves.toBe("timeout");
  });

  it("таймер не держит процесс (unref)", () => {
    jest.useFakeTimers();
    try {
      const spy = jest.spyOn(global, "setTimeout");
      void delay(60_000);
      const timer = spy.mock.results[0].value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
