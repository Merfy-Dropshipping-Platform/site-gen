/**
 * Запись черновой ревизии магазина новой темы даёт сигнал открытым редакторам
 * (`/sites/:id/preview/events`, событие `change`): ИИ через MCP, другая
 * вкладка, автосейв — любой источник, потому что все писатели идут через
 * `StoreContentService`. Нынешние темы не затронуты: сигнала нет.
 */
import { StoreContentService } from "../store-content.service";
import type { SaveParams } from "../store-content.port";

const DOC = { pages: [], pagesData: {} };
const NOVA = { themeId: "nova", publicUrl: null, currentRevisionId: "r0" };
const ROSE = { themeId: "rose", publicUrl: null, currentRevisionId: "r0" };

function setup() {
  const adapter = {
    save: jest.fn().mockResolvedValue({ version: "r1" }),
    rollback: jest
      .fn()
      .mockResolvedValue({ restoredFrom: "r-old", revisionId: "r2" }),
  };
  const handoff = { signalDraft: jest.fn().mockResolvedValue(undefined) };
  const service = new StoreContentService(adapter as any, handoff as any);
  return { adapter, handoff, service };
}

const onBase = (site: typeof NOVA): SaveParams => ({
  mode: "on-base",
  document: DOC,
  base: "r0",
  mergePolicy: "reject-conflicts",
  tenantId: "t-1",
  site,
});
const blind = (site: typeof NOVA, setCurrent?: boolean): SaveParams => ({
  mode: "blind",
  document: DOC,
  tenantId: "t-1",
  site,
  setCurrent,
});

describe("сигнал о записи черновика (магазины новой темы)", () => {
  it("запись от базы — сигнал с id новой ревизии", async () => {
    const { service, handoff } = setup();
    await service.save("site-1", onBase(NOVA));
    expect(handoff.signalDraft).toHaveBeenCalledWith("site-1", "r1");
  });

  it("запись вслепую с setCurrent — сигнал; без setCurrent ревизия не текущая — сигнала нет", async () => {
    const { service, handoff } = setup();
    await service.save("site-1", blind(NOVA));
    expect(handoff.signalDraft).not.toHaveBeenCalled();
    await service.save("site-1", blind(NOVA, true));
    expect(handoff.signalDraft).toHaveBeenCalledTimes(1);
  });

  it("откат на другую версию — сигнал с новой ревизией; откат на текущую ничего не пишет — тишина", async () => {
    const { service, handoff } = setup();
    await service.rollback("site-1", {
      tenantId: "t-1",
      site: NOVA,
      revisionId: "r-old",
    });
    expect(handoff.signalDraft).toHaveBeenCalledWith("site-1", "r2");
    handoff.signalDraft.mockClear();
    await service.rollback("site-1", {
      tenantId: "t-1",
      site: NOVA,
      revisionId: "r0",
    });
    expect(handoff.signalDraft).not.toHaveBeenCalled();
  });

  it("нынешняя тема (rose) — сигнала нет, запись как раньше", async () => {
    const { service, handoff, adapter } = setup();
    await expect(service.save("site-1", onBase(ROSE))).resolves.toEqual({
      version: "r1",
    });
    expect(adapter.save).toHaveBeenCalledTimes(1);
    expect(handoff.signalDraft).not.toHaveBeenCalled();
  });

  it("запись не удалась — сигнала нет, ошибка доходит до вызывающего", async () => {
    const { service, handoff, adapter } = setup();
    adapter.save.mockRejectedValueOnce(new Error("revision_conflict"));
    await expect(service.save("site-1", onBase(NOVA))).rejects.toThrow(
      "revision_conflict",
    );
    expect(handoff.signalDraft).not.toHaveBeenCalled();
  });

  it("сбой самого сигнала запись не ломает; без брокера (вне Nest DI) — тихо", async () => {
    const { adapter, handoff } = setup();
    handoff.signalDraft.mockRejectedValueOnce(new Error("broker down"));
    const service = new StoreContentService(adapter as any, handoff as any);
    await expect(service.save("site-1", onBase(NOVA))).resolves.toEqual({
      version: "r1",
    });
    const bare = new StoreContentService(adapter as any);
    await expect(bare.save("site-1", onBase(NOVA))).resolves.toEqual({
      version: "r1",
    });
  });
});
