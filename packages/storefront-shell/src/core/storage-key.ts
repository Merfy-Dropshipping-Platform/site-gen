import { ShellError } from '../errors';

// Ключ ctx.storage: ядро отказывает при выполнении и роняет секцию. Ту же функцию зовёт проверка при сохранении
// (storefront-sections, script-storage.ts, вход @merfy/shell/storage-key): ключ, написанный в коде, отказывается у автора,
// а не у покупателя; правило одно, копии нет.
const KEY_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const checkKey = (key: string): string => {
  if (!KEY_CASE.test(key)) throw new ShellError('sdk-call-invalid', `ключ «${key}» хранилища — kebab-case`);
  return key;
};
