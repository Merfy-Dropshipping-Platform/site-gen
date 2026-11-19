import type { Marker } from "@merfy-dropshipping-platform/images";
import type { ImageStore, PutOptions } from "../image-store";
import type {
  GenerateInput,
  GeneratedFile,
  ImagesGenerator,
  ImagesLib,
  ImagesNames,
} from "../images-lib";

/** Хранилище в памяти; порядок записей виден в `writes`. */
export class MemoryStore implements ImageStore {
  readonly objects = new Map<string, Buffer>();
  readonly headers = new Map<string, PutOptions>();
  readonly writes: string[] = [];
  failGetTimes = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [key, text] of Object.entries(initial)) {
      this.objects.set(key, Buffer.from(text));
    }
  }

  async put(key: string, body: Buffer, options: PutOptions): Promise<void> {
    this.headers.set(key, options);
    this.objects.set(key, body);
    this.writes.push(key);
  }

  async get(key: string): Promise<Buffer> {
    if (this.failGetTimes > 0) {
      this.failGetTimes -= 1;
      throw new Error("storage_down");
    }
    const body = this.objects.get(key);
    if (!body) throw new Error(`no_such_key ${key}`);
    return body;
  }

  async list(prefix: string) {
    return [...this.objects]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.length }));
  }
}

/** Имена копий — как в пакете (`<ключ>.d.webp`, `.m.webp`, `.v.json`). */
export const fakeNames = {
  RULES_VERSION: 1,
  isDerivedKey: (key: string) => /\.(?:[dm]\.webp|v\.json)$/.test(key),
  markerKey: (key: string) => `${key}.v.json`,
  variantKey: (key: string, kind: string) => `${key}.${kind}.webp`,
} as unknown as ImagesNames;

const marker = (overrides: Partial<Marker>): Marker => ({
  rulesVersion: 1,
  status: "ok",
  attempts: 1,
  width: 2000,
  height: 1000,
  variants: [],
  ...overrides,
});

const file = (key: string, contentType: string): GeneratedFile => ({
  key,
  body: Buffer.from(key),
  contentType,
  cacheControl: "x",
});

/**
 * Генератор-двойник: обычные байты — две копии и маркер `ok`, пустые — маркер
 * `failed`. `gate` держит работу, пока тест её не отпустит.
 */
export class FakeGenerator implements ImagesGenerator {
  readonly calls: GenerateInput[] = [];
  active = 0;
  maxActive = 0;
  gate: Promise<void> | null = null;
  failWith: Error | null = null;

  async generateImage(input: GenerateInput) {
    this.calls.push(input);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await this.gate;
      if (this.failWith) throw this.failWith;
      return this.result(input);
    } finally {
      this.active -= 1;
    }
  }

  private result({ key, bytes, previousAttempts = 0 }: GenerateInput) {
    const attempts = previousAttempts + 1;
    if (bytes.length === 0) {
      const failed = marker({ status: "failed", attempts, width: null });
      return { marker: failed, files: [file(`${key}.v.json`, "json")] };
    }
    return {
      marker: marker({ attempts }),
      files: [
        file(`${key}.m.webp`, "image/webp"),
        file(`${key}.d.webp`, "image/webp"),
        file(`${key}.v.json`, "application/json"),
      ],
    };
  }
}

export const libOf = (generator: ImagesGenerator): ImagesLib => ({
  names: async () => fakeNames,
  generator: async () => generator,
});

/** Отложенное событие: тест решает, когда оно наступит. */
export function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
