/**
 * Источник значений по умолчанию панели конструктора для записи с базой.
 * Боевой источник — `ThemePuckConfigController.getPuckConfig` (то же, что
 * получает конструктор); здесь проверяется обёртка: разбор ответа, кэш на
 * тему и безопасный отказ (запись не должна падать из-за дефолтов).
 */
import { cachedPanelDefaults, defaultsFromPuckConfig } from "../panel-defaults";

describe("значения по умолчанию панели", () => {
  it("тип секции → её defaultProps из ответа puck-config", () => {
    expect(
      defaultsFromPuckConfig({
        components: {
          Hero: { defaultProps: { alignment: "center" } },
          Footer: {},
        },
      }),
    ).toEqual({ Hero: { alignment: "center" }, Footer: {} });
  });

  it("загружается один раз на тему", async () => {
    const load = jest.fn(async () => ({
      components: { Hero: { defaultProps: { alignment: "center" } } },
    }));
    const source = cachedPanelDefaults(load);
    await source("bloom");
    const again = await source("bloom");
    expect(again).toEqual({ Hero: { alignment: "center" } });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("не загрузилось — пусто, без исключения и без повторной загрузки на каждой записи", async () => {
    const load = jest.fn(async () => {
      throw new Error("нет артефактов блоков");
    });
    const source = cachedPanelDefaults(load);
    await expect(source("flux")).resolves.toEqual({});
    await expect(source("flux")).resolves.toEqual({});
    expect(load).toHaveBeenCalledTimes(1);
  });
});
