/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Общие типы шагов миграции.
 */

export type Block = { type?: string; props?: Record<string, unknown> };
export type PageData = {
  content?: Block[];
  root?: { props?: Record<string, unknown> };
  zones?: Record<string, unknown>;
};
