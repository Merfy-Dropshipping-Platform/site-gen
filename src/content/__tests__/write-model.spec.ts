/**
 * Модель записи (этап 2): эталон досеянного не построился — запись идёт без
 * фильтра, как у обычной записи, но НЕ молча: в логе предупреждение (ревью).
 */
import * as writeFilter from "../../utils/revision-write-filter";
import { makeDocumentWriteModel } from "../write-model";

type Doc = Record<string, any>;

const DOC: Doc = {
  pages: [{ id: "home" }],
  pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
};

describe("модель записи: эталон досеянного не построился", () => {
  afterEach(() => jest.restoreAllMocks());

  it("фильтр отключается, запись идёт, в логе предупреждение с причиной", async () => {
    jest
      .spyOn(writeFilter, "buildSeedReference")
      .mockRejectedValue(new Error("пакет темы не найден"));
    const warn = jest.fn();

    const model = await makeDocumentWriteModel({
      load: async (doc) => doc ?? {},
      storedCurrent: DOC,
      themeId: "bloom",
      publicUrl: null,
      filterSeeded: true,
      panelDefaults: {},
      warn,
    });

    expect(model.filterForWrite(DOC)).toEqual(DOC);
    await expect(model.normalize(DOC)).resolves.toEqual(DOC);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("пакет темы не найден");
  });

  it("эталон построился — предупреждений нет", async () => {
    const warn = jest.fn();
    await makeDocumentWriteModel({
      load: async (doc) => doc ?? {},
      storedCurrent: DOC,
      themeId: "bloom",
      publicUrl: null,
      filterSeeded: true,
      panelDefaults: {},
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
