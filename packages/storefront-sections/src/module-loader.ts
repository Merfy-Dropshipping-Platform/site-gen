import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { ASTRO_RUNTIME } from './astro-runtime';
import type { TemplateComponent } from './trial-render';

// Фабрика компонента Astro среди значений модуля: у неё есть собственные свойства (результат компиляции Astro).
const isTemplateComponent = (value: unknown): value is TemplateComponent =>
  typeof value === 'function' && Object.getOwnPropertyNames(value).length > 0;

// Загрузка модуля шаблона (блок 1 «Секций и SDK»). Модуль импортирует рантайм Astro по имени пакета, а грузится из
// data:-адреса, где имён пакетов нет, — имя заменяется полным адресом файла рантайма из зависимостей этого пакета.
// Других импортов в модуле нет: их не пропускает приём (compile.ts).
export const RUNTIME_URL = pathToFileURL(createRequire(import.meta.url).resolve(ASTRO_RUNTIME)).href;

export async function linkedModule(code: string): Promise<string> {
  await init;
  const [imports] = parse(code);
  return imports
    .filter((entry) => entry.n === ASTRO_RUNTIME)
    .reduceRight((text, entry) => `${text.slice(0, entry.s)}${RUNTIME_URL}${text.slice(entry.e)}`, code);
}

export async function loadTemplate(code: string): Promise<TemplateComponent> {
  const linked = await linkedModule(code);
  const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(linked, 'utf8').toString('base64')}`);
  const value: unknown = typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : undefined;
  // Проверка формы уже прошла: это фабрика компонента Astro (модуль шаблона компилирует сам Astro).
  if (!isTemplateComponent(value)) throw new Error('в модуле шаблона нет компонента по умолчанию');
  return value;
}
