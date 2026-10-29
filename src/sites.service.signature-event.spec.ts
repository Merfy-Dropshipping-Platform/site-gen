import { SitesDomainService } from "./sites.service";

/**
 * Подпись под подвалом (site.settings.themeBrandName) — вход сборки новой темы (site.signature).
 * Смена подписи шлёт сборщику событие branding-change; повторное сохранение того же текста,
 * правка других настроек и патч без settings — нет. Паттерн — sites.service.branding-republish.spec.ts.
 */
function makeDb(existingRow: unknown) {
  const db: any = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([existingRow]) }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([{ id: "s1" }]) }),
      }),
    }),
  };
  return db;
}

function makeService(settings: Record<string, unknown> | null) {
  const handoff = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new SitesDomainService(
    makeDb({ themeId: "nova", status: "published", settings, branding: null }),
    {} as any,
    {} as any,
    { emit: () => {} } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { queueBuild: () => Promise.resolve(true) } as any,
    undefined,
    undefined,
    handoff as any,
  );
  return { service, handoff };
}

const update = (service: SitesDomainService, patch: Record<string, unknown>) =>
  service.update({ tenantId: "t1", siteId: "s1", patch });

describe("SitesDomainService.update — подпись под подвалом", () => {
  it("новая подпись → branding-change сборщику", async () => {
    const { service, handoff } = makeService(null);
    await update(service, { settings: { themeBrandName: "Сделано в ООО «Ромашка»" } });
    expect(handoff.notify).toHaveBeenCalledWith("s1", "branding-change", "SitesDomainService.update");
  });

  it("подпись очищена → branding-change", async () => {
    const { service, handoff } = makeService({ themeBrandName: "Своя" });
    await update(service, { settings: { themeBrandName: "" } });
    expect(handoff.notify).toHaveBeenCalledWith("s1", "branding-change", "SitesDomainService.update");
  });

  it("тот же текст (с пробелами по краям) → события нет", async () => {
    const { service, handoff } = makeService({ themeBrandName: "Своя" });
    await update(service, { settings: { themeBrandName: " Своя " } });
    expect(handoff.notify).not.toHaveBeenCalled();
  });

  it("другая настройка (оформление заказа) → события нет", async () => {
    const { service, handoff } = makeService({ themeBrandName: "Своя" });
    await update(service, { settings: { addressRequired: true } });
    expect(handoff.notify).not.toHaveBeenCalled();
  });

  it("патч без settings → события нет", async () => {
    const { service, handoff } = makeService({ themeBrandName: "Своя" });
    await update(service, { description: "x" });
    expect(handoff.notify).not.toHaveBeenCalled();
  });
});
