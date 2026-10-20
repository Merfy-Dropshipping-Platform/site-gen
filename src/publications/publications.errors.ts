/**
 * Ошибка записи или блога с кодом для кабинета (PUB-11).
 *
 * RPC-ответ при ошибке: `{ success: false, message, error: { code, message,
 * field?, status } }` — шлюз отдаёт клиенту `{ statusCode, code, message,
 * field? }` с этим статусом. `message` — по-русски, для продавца.
 */
export type PublicationErrorCode =
  | "validation_failed"
  | "publication_transition_not_allowed"
  | "slug_taken"
  | "blog_handle_taken"
  | "publication_not_found"
  | "blog_not_found"
  | "internal_error";

export interface RpcErrorBody {
  code: PublicationErrorCode;
  message: string;
  field?: string;
  status: number;
}

export interface RpcFailure {
  success: false;
  /** Для шлюзов до контракта: у «не найдено» — прежнее `not_found`. */
  message: string;
  error: RpcErrorBody;
}

export class PublicationError extends Error {
  readonly code: PublicationErrorCode;
  readonly status: number;
  readonly field?: string;

  constructor(
    code: PublicationErrorCode,
    message: string,
    options: { status: number; field?: string },
  ) {
    super(message);
    this.name = "PublicationError";
    this.code = code;
    this.status = options.status;
    this.field = options.field;
  }
}

export const publicationNotFound = () =>
  new PublicationError(
    "publication_not_found",
    "Запись не найдена — возможно, её уже удалили.",
    { status: 404 },
  );

export const blogNotFound = (field?: string) =>
  new PublicationError(
    "blog_not_found",
    "Блог не найден — обновите страницу и выберите блог заново.",
    { status: 404, field },
  );

export const slugTaken = (slug: string) =>
  new PublicationError(
    "slug_taken",
    `Адрес «${slug}» уже занят другой записью этого магазина — укажите другой.`,
    { status: 409, field: "slug" },
  );

export const blogHandleTaken = (handle: string) =>
  new PublicationError(
    "blog_handle_taken",
    `Адрес «${handle}» уже занят другим блогом этого магазина — укажите другой.`,
    { status: 409, field: "handle" },
  );

export function missingParams(fields: string): PublicationError {
  return new PublicationError(
    "validation_failed",
    `Не переданы обязательные поля: ${fields}.`,
    { status: 400, field: fields.split(",")[0].trim() },
  );
}

/** Любая ошибка → RPC-ответ с кодом. Непредвиденная — 500 без подробностей. */
export function toRpcFailure(err: unknown): RpcFailure {
  if (err instanceof PublicationError) {
    const error: RpcErrorBody = {
      code: err.code,
      message: err.message,
      status: err.status,
      ...(err.field ? { field: err.field } : {}),
    };
    return {
      success: false,
      message: err.status === 404 ? "not_found" : err.message,
      error,
    };
  }
  return {
    success: false,
    message: "internal_error",
    error: {
      code: "internal_error",
      message: "Не удалось сохранить изменения. Попробуйте ещё раз.",
      status: 500,
    },
  };
}

/** Нарушение уникального индекса Postgres (гонка двух сохранений). */
export function uniqueViolationOf(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  if (e?.code === "23505") return e.constraint ?? "";
  if (e?.cause) return uniqueViolationOf(e.cause);
  return null;
}
