import type { z } from "zod";

/** Ошибки схемы входа как «путь: сообщение» — детали отказа `invalid_input`. */
export function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}
