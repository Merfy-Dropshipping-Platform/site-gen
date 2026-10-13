/**
 * Сторож строки рантайма записей расширений (задача 5.4 спеки 120):
 *  — строка пересобрана после последней правки модуля (файл
 *    extension-orders.runtime.ts делает скрипт, руками не правят);
 *  — в строке нет zod, закрывающего тега скрипта и слов предметной области;
 *  — строка ставит глобал, который зовёт секция «Заказы».
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXTENSION_ORDERS_RUNTIME_SOURCE } from "../runtime/extension-orders.runtime";

const PACKAGE_DIR = resolve(__dirname, "..");
const BUILD_SCRIPT = "scripts/build-orders-runtime.mjs";
const GENERATED_FILE = "runtime/extension-orders.runtime.ts";
/** Предел размера строки, КБ: на 13.10 строка весит ≈ 14 КБ. */
const MAX_SOURCE_KB = 30;

describe("строка рантайма записей для секции «Заказы»", () => {
  it("совпадает с тем, что даёт пересборка модуля", () => {
    const rebuilt = execFileSync(process.execPath, [BUILD_SCRIPT, "--print"], {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    });
    expect(rebuilt).toBe(
      readFileSync(resolve(PACKAGE_DIR, GENERATED_FILE), "utf8"),
    );
  });

  it("не тянет zod, не содержит закрывающего тега скрипта и слов предметной области", () => {
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE).not.toMatch(/zod/i);
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE).not.toMatch(/<\/script/i);
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE).not.toMatch(/заявк|\brequests?\b/i);
  });

  it(`весит не больше ${MAX_SOURCE_KB} КБ`, () => {
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE.length / 1024).toBeLessThan(
      MAX_SOURCE_KB,
    );
  });

  it("выставляет window.__merfyExtensionOrders с mountRows и mountEntry", () => {
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE).toContain("__merfyExtensionOrders");
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE).toContain(
      "mountRows: mountRecordRows",
    );
    expect(EXTENSION_ORDERS_RUNTIME_SOURCE).toContain(
      "mountEntry: mountRecordEntry",
    );
  });
});
