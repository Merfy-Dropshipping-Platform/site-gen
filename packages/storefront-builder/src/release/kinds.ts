import type { ReleaseKind, ReleaseRow } from './store';

// Чем выпуски темы, платформы и расширения отличаются друг от друга (design.md блока 10; П10-5 А, С7-14 Б) — данными.
// event — тип события сборки (блок 3); approval — после тестового магазина ждать «да» человека (П10-2 В, только тема:
// выкатку программы и версию расширения «да» уже прошли); pin — переписывать закрепление site.theme_version;
// pauseOnRevert — сломанный магазин возвращается с паузой (код платформы и расширения не закрепить); reached — магазин
// дошёл до версии по манифесту живой сборки; expectedVersion — версия темы в конфиге страницы.

// Что правилам нужно из манифеста живой сборки (StorefrontManifest блока 4 подходит целиком).
export interface ReachedManifest {
  theme: { id: string; version: string; contentHash: string };
  platform: { renderHash: string };
  // Включённые расширения и их версии (задача 11); в манифестах сборок до неё поля нет.
  extensions?: readonly { id: string; version: string }[];
}

export interface KindRules {
  event: string;
  approval: boolean;
  pin: boolean;
  pauseOnRevert: boolean;
  reached: (manifest: ReachedManifest, release: ReleaseRow) => boolean;
  expectedVersion: (release: ReleaseRow) => string | null;
  // Сборка не изменилась, а живая — не на новом коде: магазин уходит из волны пропуском (только платформа).
  leaveUnchanged: boolean;
}

export const KINDS: Record<ReleaseKind, KindRules> = {
  theme: {
    event: 'theme-release',
    approval: true,
    pin: true,
    pauseOnRevert: false,
    reached: (manifest, release) =>
      manifest.theme.id === release.subject &&
      manifest.theme.version === release.toVersion &&
      manifest.theme.contentHash === release.toHash,
    expectedVersion: (release) => release.toVersion,
    leaveUnchanged: false,
  },
  platform: {
    event: 'platform-release',
    approval: false,
    pin: false,
    pauseOnRevert: true,
    reached: (manifest, release) => manifest.platform.renderHash === release.toHash,
    expectedVersion: () => null,
    leaveUnchanged: true,
  },
  // Дошёл: в манифесте живой сборки расширение той же версии (поле extensions — задача 11).
  extension: {
    event: 'extension-release',
    approval: false,
    pin: false,
    pauseOnRevert: true,
    reached: (manifest, release) =>
      (manifest.extensions ?? []).some((item) => item.id === release.subject && item.version === release.toVersion),
    expectedVersion: () => null,
    leaveUnchanged: false,
  },
};

// Сбой данных — не поломка версии: сервис не ответил, снимок не получен, магазин без адреса, ошибка без кода (база,
// хранилище). Магазин ждёт повторов сборщика, волна ждёт магазин. Всё остальное — поломка: выпуск останавливается.
export const DATA_FAILURES: ReadonlySet<string> = new Set([
  'rpc-failed',
  'data-not-received',
  'shop-invalid',
  'unknown',
]);
export const isBreakage = (code: string): boolean => !DATA_FAILURES.has(code);
