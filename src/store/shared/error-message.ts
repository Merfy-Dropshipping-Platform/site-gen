/** Текст ошибки для лога и `lifecycle_error`: сообщение `Error` или само значение. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
