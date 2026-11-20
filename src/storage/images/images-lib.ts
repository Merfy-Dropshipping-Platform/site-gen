import type { Marker } from "@merfy-dropshipping-platform/images";

/**
 * Пакет картинок — только ESM, и в `exports` у него одно условие `import`:
 * из CommonJS-сборки Nest его не загрузить ни `require`, ни статическим
 * `import` (tsc превращает его в `require`). Поэтому грузим настоящим
 * динамическим `import()`, спрятанным от компилятора.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- нужен настоящий import(), tsc его не трогает
const dynamicImport = new Function("specifier", "return import(specifier)");

const PACKAGE = "@merfy-dropshipping-platform/images";

/** Чистая часть пакета: имена копий, маркер, версия правил. Без sharp. */
export type ImagesNames = typeof import("@merfy-dropshipping-platform/images");

export interface GeneratedFile {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

export interface GenerateInput {
  key: string;
  bytes: Uint8Array;
  previousAttempts?: number;
  /** Прежний маркер старой версии правил: делаются только недостающие копии. */
  previous?: Marker;
}

/** Вход `/generate` пакета: копии и маркер из байтов оригинала (sharp). */
export interface ImagesGenerator {
  generateImage(
    input: GenerateInput,
  ): Promise<{ marker: Marker; files: GeneratedFile[] }>;
}

/**
 * Две части загружаются отдельно: удалению копий sharp не нужен, и без
 * его бинарника оригиналы всё равно должны удаляться вместе с копиями.
 */
export interface ImagesLib {
  names(): Promise<ImagesNames>;
  generator(): Promise<ImagesGenerator>;
}

/** Загрузка один раз; сорвалась — при следующем обращении пробуем снова. */
function memo<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => {
    loaded ??= load().catch((error: unknown) => {
      loaded = undefined;
      throw error;
    });
    return loaded;
  };
}

export const defaultImagesLib: ImagesLib = {
  names: memo(() => dynamicImport(PACKAGE)),
  generator: memo(() => dynamicImport(`${PACKAGE}/generate`)),
};

/** Провайдер Nest: тесты подменяют библиотеку, потому что jest не грузит ESM. */
export const IMAGES_LIB = Symbol("IMAGES_LIB");
