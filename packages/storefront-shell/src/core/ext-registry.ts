import type { ExtModule } from './types';

// Связь API части ext с модулями расширений (блок 9, часть 9в): ядро находит модуль по uses: ["ext:<id>"], не зная кода
// части. Файл маленький и без зависимостей: часть ext в бандле только страниц с "ext:<id>", бюджет ядра — без неё.
export const EXT_USE_PREFIX = 'ext:';
export const EXT_PART_NAME = 'ext';

const modules = new WeakMap<object, (id: string) => ExtModule | null>();

// Часть ext регистрирует свой API: по id расширения — модуль или null (id нет в конфиге страницы).
export function registerExtModules(api: object, moduleOf: (id: string) => ExtModule | null): void {
  modules.set(api, moduleOf);
}

export function extModuleOf(api: unknown, id: string): ExtModule | null {
  if (typeof api !== 'object' || api === null) return null;
  return modules.get(api)?.(id) ?? null;
}
