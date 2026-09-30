/**
 * Сколько раз запись пробует (ревью этапа 2): гонку CAS повторяет только
 * порт (`CAS_ATTEMPTS`), писатель сверху (`rewriteCurrent`) пересчитывает
 * правку только при споре о том же месте (`RevisionMergeConflictError`).
 * Раньше оба повторяли всё: под нагрузкой — до 3 × 3 = 9 записей на правку.
 */
import { rewriteCurrent, REWRITE_ATTEMPTS } from "../rewrite-current";
import { CAS_ATTEMPTS, saveOnBase } from "../save-on-base";
import type { RevisionStore } from "../save-on-base";
import {
  RevisionConflictError,
  RevisionMergeConflictError,
} from "../store-content.port";
import type { SaveOnBaseParams } from "../store-content.port";
import type { WriteModel } from "../write-model";

const DOC = { pages: [], pagesData: {} };

const IDENTITY_MODEL: WriteModel = {
  normalize: async (doc) => doc ?? {},
  filterForWrite: (doc) => doc,
  isAutoValue: () => false,
  isDerived: () => false,
};

/** Хранилище, где каждую попытку CAS перехватывает чужая запись. */
function alwaysLosingStore() {
  const commits: Array<string | undefined> = [];
  const store: RevisionStore = {
    fetchData: async () => DOC,
    readPointer: async () => "r0",
    writeModel: async () => IDENTITY_MODEL,
    commit: async (write) => {
      commits.push(write.current);
      return false;
    },
  };
  return { store, commits };
}

const PARAMS: SaveOnBaseParams = {
  mode: "on-base",
  document: DOC,
  base: "r0",
  mergePolicy: "reject-conflicts",
  tenantId: "t-1",
  site: { themeId: null, publicUrl: null, currentRevisionId: "r0" },
};

const logger = { log: () => undefined, warn: () => undefined } as never;

describe("число попыток записи", () => {
  it("порт: CAS проигран каждый раз — ровно CAS_ATTEMPTS записей, потом RevisionConflictError", async () => {
    const { store, commits } = alwaysLosingStore();
    await expect(
      saveOnBase(store, "site-1", PARAMS, logger),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect(commits).toHaveLength(CAS_ATTEMPTS);
  });

  it("писатель сверху не перемножает попытки: гонка CAS — CAS_ATTEMPTS записей, а не 9", async () => {
    const { store, commits } = alwaysLosingStore();
    await expect(
      rewriteCurrent(() => saveOnBase(store, "site-1", PARAMS, logger)),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect(commits).toHaveLength(CAS_ATTEMPTS);
  });

  it("спор о том же месте — правка пересчитывается до REWRITE_ATTEMPTS раз", async () => {
    const attempt = jest.fn(async () => {
      throw new RevisionMergeConflictError([]);
    });
    await expect(rewriteCurrent(attempt)).rejects.toBeInstanceOf(
      RevisionMergeConflictError,
    );
    expect(attempt).toHaveBeenCalledTimes(REWRITE_ATTEMPTS);
  });

  it("спор, потом успех — результат последнего пересчёта", async () => {
    const attempt = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new RevisionMergeConflictError([]))
      .mockResolvedValueOnce("записано");
    await expect(rewriteCurrent(attempt)).resolves.toBe("записано");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("прочая ошибка — без повтора", async () => {
    const attempt = jest.fn(async () => {
      throw new Error("site_not_found");
    });
    await expect(rewriteCurrent(attempt)).rejects.toThrow("site_not_found");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
