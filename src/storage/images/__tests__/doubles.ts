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

const KINDS = ["s", "m", "d"] as const;
const CURRENT_VERSION = 2;

const parseMarker = (text: string): Marker | null => {
  try {
    return JSON.parse(text) as Marker;
  } catch {
    return null;
  }
};

/** Имена и маркеры — как в пакете (`<ключ>.s|m|d.webp`, `.v.json`, версия правил 2). */
export const fakeNames = {
  RULES_VERSION: CURRENT_VERSION,
  VARIANT_KINDS: KINDS,
  isDerivedKey: (key: string) => /\.(?:[smd]\.webp|v\.json)$/.test(key),
  markerKey: (key: string) => `${key}.v.json`,
  variantKey: (key: string, kind: string) => `${key}.${kind}.webp`,
  parseMarker,
  needsUpgrade: (m: Marker) =>
    m.status === "ok" && m.rulesVersion < CURRENT_VERSION,
} as unknown as ImagesNames;

const marker = (overrides: Partial<Marker>): Marker => ({
  rulesVersion: CURRENT_VERSION,
  status: "ok",
  attempts: 1,
  width: 2000,
  height: 1000,
  variants: [],
  ...overrides,
});

/** Тело маркера в хранилище — JSON, как у настоящего пакета. */
export const markerJson = (overrides: Partial<Marker>): string =>
  JSON.stringify(marker(overrides));

const variantOf = (key: string, kind: (typeof KINDS)[number]) => ({
  kind,
  width: 100,
  key: `${key}.${kind}.webp`,
});

const file = (key: string, contentType: string, body = key): GeneratedFile => ({
  key,
  body: Buffer.from(body),
  contentType,
  cacheControl: "x",
});

const markerFile = (key: string, m: Marker): GeneratedFile =>
  file(`${key}.v.json`, "application/json", JSON.stringify(m));

/**
 * Генератор-двойник: обычные байты — недостающие копии из s, m, d и маркер `ok`
 * версии 2, пустые — маркер `failed` (с `previous` — прежний маркер версии 2).
 * `gate` держит работу, пока тест её не отпустит.
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

  private result({
    key,
    bytes,
    previousAttempts = 0,
    previous,
  }: GenerateInput) {
    const attempts = previousAttempts + 1;
    if (bytes.length === 0 && previous) {
      const carried = marker({
        ...previous,
        rulesVersion: CURRENT_VERSION,
        attempts,
      });
      return { marker: carried, files: [markerFile(key, carried)] };
    }
    if (bytes.length === 0) {
      const failed = marker({ status: "failed", attempts, width: null });
      return { marker: failed, files: [markerFile(key, failed)] };
    }
    const kept = previous?.variants ?? [];
    const created = KINDS.filter((kind) => !kept.some((v) => v.kind === kind));
    const result = marker({
      attempts,
      variants: [...kept, ...created.map((kind) => variantOf(key, kind))],
    });
    const copies = created.map((kind) =>
      file(`${key}.${kind}.webp`, "image/webp"),
    );
    return { marker: result, files: [...copies, markerFile(key, result)] };
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
