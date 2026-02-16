/**
 * Page Generator — Puck JSON → .astro file content.
 *
 * Reads Puck JSON content[], maps each component to its registry entry,
 * and generates a valid .astro file with correct imports:
 * - React Islands get client:* directives (client:load, client:visible, client:idle)
 * - Astro components import directly (.astro)
 *
 * Props from JSON are passed through to each component.
 */

/** How a component should be rendered in Astro */
export type ComponentKind = "island" | "static";

/** Hydration directive for React Islands */
export type ClientDirective = "client:load" | "client:visible" | "client:idle";

/** Registry entry describing a component available for page generation */
export interface ComponentRegistryEntry {
  /** Unique component type name (must match Puck JSON `type` field) */
  name: string;
  /** "island" = React .tsx with client:* directive, "static" = Astro .astro component */
  kind: ComponentKind;
  /** Import path relative to the Astro project src/ (e.g. "../components/Hero.astro") */
  importPath: string;
  /** Hydration directive for islands; defaults to "client:load" */
  clientDirective?: ClientDirective;
}

/** Shape of Puck JSON content item */
export interface PuckContentItem {
  type: string;
  props?: Record<string, unknown>;
  /** Nested content (slots) */
  content?: PuckContentItem[];
}

/** Top-level Puck page data */
export interface PuckPageData {
  content?: PuckContentItem[];
  meta?: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Serialize a value into an Astro template expression.
 * Strings → quoted, others → JSON wrapped in {}.
 */
function serializeProp(key: string, value: unknown): string {
  if (value === true) return key;
  if (value === false) return `${key}={false}`;
  if (typeof value === "string") return `${key}=${JSON.stringify(value)}`;
  if (typeof value === "number") return `${key}={${value}}`;
  // Objects/arrays — pass as expression
  return `${key}={${JSON.stringify(value)}}`;
}

/**
 * Render props as Astro attributes string.
 */
function renderProps(props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) return "";
  const entries = Object.entries(props).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return "";
  return " " + entries.map(([k, v]) => serializeProp(k, v)).join(" ");
}

/**
 * Generate the import alias for a component to avoid name collisions.
 * E.g., "Hero" stays "Hero", but duplicates get a suffix.
 */
function makeAlias(name: string, usedNames: Set<string>): string {
  let alias = name;
  let counter = 2;
  while (usedNames.has(alias)) {
    alias = `${name}${counter}`;
    counter++;
  }
  usedNames.add(alias);
  return alias;
}

interface ImportEntry {
  alias: string;
  path: string;
  directive?: string; // e.g. "client:load"
}

/**
 * Recursively collect import entries and component render lines from content items.
 */
function processContentItems(
  items: PuckContentItem[],
  registry: Record<string, ComponentRegistryEntry>,
  usedNames: Set<string>,
  imports: Map<string, ImportEntry>, // keyed by component type
  indent: string,
): string[] {
  const lines: string[] = [];

  for (const item of items) {
    const entry = registry[item.type];
    if (!entry) {
      // Unknown component — render a placeholder comment
      lines.push(`${indent}<!-- Unknown component: ${item.type} -->`);
      continue;
    }

    // Register import (deduplicated by type)
    if (!imports.has(item.type)) {
      const alias = makeAlias(entry.name, usedNames);
      const directive =
        entry.kind === "island"
          ? (entry.clientDirective ?? "client:load")
          : undefined;
      imports.set(item.type, { alias, path: entry.importPath, directive });
    }

    const importEntry = imports.get(item.type)!;
    const propsStr = renderProps(item.props);
    const directiveStr = importEntry.directive
      ? ` ${importEntry.directive}`
      : "";

    // Check for nested content (slots)
    if (item.content && item.content.length > 0) {
      lines.push(`${indent}<${importEntry.alias}${propsStr}${directiveStr}>`);
      const childLines = processContentItems(
        item.content,
        registry,
        usedNames,
        imports,
        indent + "  ",
      );
      lines.push(...childLines);
      lines.push(`${indent}</${importEntry.alias}>`);
    } else {
      lines.push(`${indent}<${importEntry.alias}${propsStr}${directiveStr} />`);
    }
  }

  return lines;
}

/**
 * Generate a complete .astro file from Puck page data and a component registry.
 *
 * @param pageData - Puck JSON data with content[] and optional meta
 * @param registry - Map of component type → ComponentRegistryEntry
 * @param options  - Additional generation options
 * @returns Valid .astro file content as a string
 */
export function generateAstroPage(
  pageData: PuckPageData,
  registry: Record<string, ComponentRegistryEntry>,
  options?: {
    layoutImport?: string; // e.g. "../layouts/StoreLayout.astro"
    layoutTag?: string; // e.g. "StoreLayout"
  },
): string {
  const content = pageData.content ?? [];
  const usedNames = new Set<string>();
  const imports = new Map<string, ImportEntry>();

  // Reserve layout alias if used
  if (options?.layoutTag) {
    usedNames.add(options.layoutTag);
  }

  // Process all content items and collect imports
  const baseIndent = options?.layoutTag ? "  " : "";
  const bodyLines = processContentItems(
    content,
    registry,
    usedNames,
    imports,
    baseIndent,
  );

  // Build import statements
  const importLines: string[] = [];
  if (options?.layoutImport && options?.layoutTag) {
    importLines.push(
      `import ${options.layoutTag} from '${options.layoutImport}';`,
    );
  }
  for (const [, entry] of imports) {
    importLines.push(`import ${entry.alias} from '${entry.path}';`);
  }

  // Assemble frontmatter
  const frontmatter = importLines.length > 0 ? importLines.join("\n") : "";

  // Assemble template
  let template: string;
  if (options?.layoutTag) {
    template = `<${options.layoutTag}>\n${bodyLines.join("\n")}\n</${options.layoutTag}>`;
  } else {
    template = bodyLines.join("\n");
  }

  // Final .astro file
  return `---\n${frontmatter}\n---\n${template}\n`;
}
