/**
 * Наша библиотека секций для заготовки магазина — исходники из пакетов самого sites:
 * `packages/storefront-sections/fixtures/shop/*` и `packages/storefront-shell/sections/*` (в магазин они идут как свои
 * секции магазина, блок 1 «Секций и SDK», пп. 1, 27). Читается с диска один раз на процесс от process.cwd(), как
 * special-pages.json (`content/new-theme-pages.ts`): в образе sites пакеты лежат в /app/packages.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import * as path from "path";

export const LIBRARY_DIRS = [
  "packages/storefront-sections/fixtures/shop",
  "packages/storefront-shell/sections",
] as const;

/** Файлы для ИИ в корне папки секции — не части секции (как `isAiFile` пакета storefront-sections). */
const AI_FILES: ReadonlySet<string> = new Set(["AGENTS.md", "CLAUDE.md"]);

export interface LibraryBlock {
  type: string;
  settings: Record<string, unknown>;
}

export interface LibrarySection {
  /** Имя из section.json, без префикса: `faq`. В магазине — `shop:faq`. */
  name: string;
  title: string;
  /** Роль секции (`cart`, `search`…): у магазина одна секция на роль. */
  role: string | null;
  /** Есть ли у секции блоки (`blocks` в section.json): тогда экземпляр получает блоки по умолчанию. */
  hasBlocks: boolean;
  defaultBlocks: LibraryBlock[];
  /** Путь от папки секции через «/» → текст. */
  files: Record<string, string>;
}

export type Library = ReadonlyMap<string, LibrarySection>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readFolder(dir: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory())
      Object.assign(files, readFolder(full, rel));
    else if (!(prefix === "" && AI_FILES.has(entry)))
      files[rel] = readFileSync(full, "utf8");
  }
  return files;
}

function defaultBlocksOf(manifest: Record<string, unknown>): LibraryBlock[] {
  if (!Array.isArray(manifest.defaultBlocks)) return [];
  return manifest.defaultBlocks.flatMap((block: unknown) =>
    isRecord(block) && typeof block.type === "string"
      ? [
          {
            type: block.type,
            settings: isRecord(block.settings) ? { ...block.settings } : {},
          },
        ]
      : [],
  );
}

function toSection(files: Record<string, string>): LibrarySection | null {
  const raw = files["section.json"];
  if (raw === undefined) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(manifest) || typeof manifest.name !== "string") return null;
  return {
    name: manifest.name,
    title: typeof manifest.title === "string" ? manifest.title : manifest.name,
    role: typeof manifest.role === "string" ? manifest.role : null,
    hasBlocks: isRecord(manifest.blocks),
    defaultBlocks: defaultBlocksOf(manifest),
    files,
  };
}

/** Библиотека из папок `dirs` от `root`: подпапка с читаемым section.json — секция. Папки нет — секций в ней нет. */
export function loadLibrary(
  root: string,
  dirs: readonly string[] = LIBRARY_DIRS,
): Library {
  const library = new Map<string, LibrarySection>();
  for (const dir of dirs) {
    const base = path.join(root, dir);
    let entries: string[];
    try {
      entries = readdirSync(base).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      const folder = path.join(base, entry);
      if (!statSync(folder).isDirectory()) continue;
      const section = toSection(readFolder(folder));
      if (section && !library.has(section.name))
        library.set(section.name, section);
    }
  }
  return library;
}

let shared: Library | undefined;

/** Библиотека с диска, один раз на процесс. */
export function skeletonLibrary(): Library {
  shared ??= loadLibrary(process.cwd());
  return shared;
}
