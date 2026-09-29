/**
 * Имя компании для проекта Coolify решает sites (этап 3, И2): спрашивает
 * user-сервис тем же RPC, что раньше звал шлюз (`user.get_organization_info`).
 * Любой сбой — `null`, решение «что тогда» принимает вызывающий (шаг
 * провижининга берёт имя магазина).
 */
import { of, throwError, NEVER } from "rxjs";
import { RmqOrganizationDirectory } from "./organization-directory.client";

function clientReturning(observable: any) {
  return { send: jest.fn(() => observable) };
}

describe("RmqOrganizationDirectory.nameOf", () => {
  it("отдаёт имя организации из user-сервиса", async () => {
    const client = clientReturning(of({ success: true, name: "  ООО Шёлк " }));
    const directory = new RmqOrganizationDirectory(client as any);

    await expect(directory.nameOf("org-1")).resolves.toBe("ООО Шёлк");
    expect(client.send).toHaveBeenCalledWith("user.get_organization_info", {
      organizationId: "org-1",
    });
  });

  it.each([
    ["success:false", of({ success: false, message: "not_found" })],
    ["пустое имя", of({ success: true, name: "   " })],
    ["ошибка RPC", throwError(() => new Error("boom"))],
  ])("%s → null", async (_title, observable) => {
    const directory = new RmqOrganizationDirectory(
      clientReturning(observable) as any,
    );
    await expect(directory.nameOf("org-1")).resolves.toBeNull();
  });

  it("user-сервис молчит — null по таймауту, а не вечное ожидание", async () => {
    jest.useFakeTimers();
    try {
      const directory = new RmqOrganizationDirectory(
        clientReturning(NEVER) as any,
      );
      const pending = directory.nameOf("org-1");
      await jest.advanceTimersByTimeAsync(
        RmqOrganizationDirectory.TIMEOUT_MS + 1,
      );
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
