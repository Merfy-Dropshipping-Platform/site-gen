/**
 * Shared legacy-props normalizer for Puck JSON → Astro props.
 *
 * The constructor writes block fields using wrapped envelopes:
 *   heading:  { text: "...", size?: "small"|"medium"|"large", alignment?, enabled? }
 *   text:     { content: "...", size?, enabled? }
 *   button:   { text: "...", link: string | { href }, enabled? }
 *
 * theme-base .astro templates consume flat strings / `{text, href}` shapes.
 * Serialising the envelope straight into an Astro attribute turns it into
 * `"[object Object]"` at render time.
 *
 * This module unwraps those envelopes recursively so both the preview
 * pipeline (`PreviewController`) and the build pipeline (`page-generator`)
 * hand blocks properly-shaped props.
 *
 * Per-block coercers in `preview.controller.ts` run AFTER this generic
 * pass and may clobber specific fields (e.g. Hero merges heading+text
 * into title+subtitle).
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizePageLink(value: unknown): Record<string, string> | undefined {
  if (typeof value === "string") return { href: value };
  if (!isPlainObject(value) || typeof value.href !== "string") return undefined;
  return {
    href: value.href,
    ...(typeof value.text === "string" ? { text: value.text } : {}),
  };
}

/**
 * Slideshow is intentionally excluded from the generic envelope flattener:
 * heading/text sizes and PagePicker link metadata are semantic renderer input,
 * not legacy wrappers. The adapter is idempotent and current fields win even
 * when their value is an empty string (clearing a field must not revive a
 * hidden legacy alias).
 */
export function normalizeSlideshowProps(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!props) return {};
  const out: Record<string, unknown> = { ...props };
  if (Array.isArray(props.slides)) {
    out.slides = props.slides.map((value) => {
      if (!isPlainObject(value)) return value;
      const slide = { ...value };

      const rawHeading = value.heading;
      if (typeof rawHeading === "string") {
        slide.heading = { text: rawHeading };
      } else if (isPlainObject(rawHeading)) {
        slide.heading = { ...rawHeading };
      }

      const rawText = value.text;
      if (typeof rawText === "string") {
        slide.text = { content: rawText };
      } else if (isPlainObject(rawText)) {
        slide.text = { ...rawText };
      } else if (typeof value.subtitle === "string") {
        slide.text = { content: value.subtitle };
      }

      const rawButton = isPlainObject(value.button) ? value.button : {};
      const hasCurrentButton = isPlainObject(value.button);
      const buttonText =
        hasOwn(rawButton, "text") && typeof rawButton.text === "string"
          ? rawButton.text
          : typeof value.ctaText === "string"
            ? value.ctaText
            : undefined;
      const rawCurrentLink = hasOwn(rawButton, "link")
        ? rawButton.link
        : hasOwn(rawButton, "href")
          ? rawButton.href
          : undefined;
      const buttonLink =
        rawCurrentLink !== undefined
          ? normalizePageLink(rawCurrentLink)
          : normalizePageLink(value.ctaUrl);
      if (
        hasCurrentButton ||
        buttonText !== undefined ||
        buttonLink !== undefined
      ) {
        slide.button = {
          ...rawButton,
          ...(buttonText !== undefined ? { text: buttonText } : {}),
          ...(buttonLink !== undefined ? { link: buttonLink } : {}),
        };
        delete (slide.button as Record<string, unknown>).href;
      }

      if (hasOwn(value, "image") && typeof value.image === "string") {
        slide.image = value.image;
      } else if (typeof value.imageUrl === "string") {
        slide.image = value.imageUrl;
      }
      return slide;
    });
  }
  if (typeof out.colorScheme === "string") {
    out.colorScheme = coerceSchemeNumber(out.colorScheme);
  }
  return out;
}

/**
 * Convert constructor's "scheme-N" string to numeric N. Leaves numbers
 * as-is. Out-of-range strings fall back to the provided default.
 */
export function coerceSchemeNumber(v: unknown, fallback = 1): number {
  if (typeof v === "number" && v >= 1 && v <= 4) return v;
  if (typeof v === "string") {
    const m = /^scheme-(\d+)$/.exec(v);
    if (m) {
      const n = Number(m[1]);
      return n >= 1 && n <= 4 ? n : fallback;
    }
  }
  return fallback;
}

/**
 * Recursively unwrap legacy envelopes. Does NOT mutate — returns a fresh
 * structure. Safe to call on any Puck JSON value.
 *
 *   { text: "Hello", size: "medium" }          → "Hello"
 *   { content: "Lorem", size: "small" }        → "Lorem"
 *   { text: "Click", link: "/x" }              → { text: "Click", href: "/x" }
 *   { text: "Click", link: { href: "/x" } }    → { text: "Click", href: "/x" }
 *
 * Structural objects (image{url,alt}, padding{top,bottom}, nested block
 * configs) are preserved — only the specific envelope shapes above unwrap.
 */
function coerceLegacyValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(coerceLegacyValue);
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);

  // {text: "...", size?, enabled?, alignment?} → text
  if (
    typeof obj.text === "string" &&
    keys.every((k) => ["text", "size", "enabled", "alignment"].includes(k))
  ) {
    return obj.text;
  }
  // {content: "...", size?, enabled?, alignment?} → content string
  if (
    typeof obj.content === "string" &&
    keys.every((k) =>
      ["content", "size", "enabled", "alignment"].includes(k),
    )
  ) {
    return obj.content;
  }
  // {text, link:"string", enabled?} → {text, href}
  if (
    typeof obj.text === "string" &&
    typeof obj.link === "string" &&
    keys.every((k) => ["text", "link", "enabled", "href"].includes(k))
  ) {
    return { text: obj.text, href: obj.link };
  }
  // {text, link:{href}, enabled?} → {text, href}
  if (
    typeof obj.text === "string" &&
    isPlainObject(obj.link) &&
    typeof (obj.link as Record<string, unknown>).href === "string"
  ) {
    return {
      text: obj.text,
      href: String((obj.link as Record<string, unknown>).href),
    };
  }
  // Recurse — preserves structural objects (image{url,alt}, padding, etc.)
  const next: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    next[k] = coerceLegacyValue(val);
  }
  return next;
}

/**
 * Apply the generic legacy unwrap to every top-level prop, plus scheme
 * coercion for common fields. Returns a fresh object.
 */
export function normalizeLegacyProps(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!props) return {};
  const out: Record<string, unknown> = {};
  // 084 vanilla pilot: keys whose envelope `{enabled, text}` is semantically
  // a struct (not a legacy "{text:string}" wrapper). Without this guard the
  // generic coerceLegacyValue collapses `bottomStrip` to its `text` string,
  // which loses `enabled` and prevents the Footer bottom strip from
  // rendering even when explicitly enabled in seed/blockDefaults.
  const STRUCT_KEYS = new Set(["bottomStrip"]);
  for (const [k, v] of Object.entries(props)) {
    if (STRUCT_KEYS.has(k) && v && typeof v === "object" && !Array.isArray(v)) {
      // Recurse into nested values but preserve the outer struct.
      const obj = v as Record<string, unknown>;
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(obj)) {
        nested[nk] = coerceLegacyValue(nv);
      }
      out[k] = nested;
    } else {
      out[k] = coerceLegacyValue(v);
    }
  }
  if (typeof out.colorScheme === "string") {
    out.colorScheme = coerceSchemeNumber(out.colorScheme);
  }
  if (typeof out.containerColorScheme === "string") {
    out.containerColorScheme = coerceSchemeNumber(out.containerColorScheme);
  }
  if (typeof out.copyrightColorScheme === "string") {
    out.copyrightColorScheme = coerceSchemeNumber(out.copyrightColorScheme);
  }
  if (typeof out.menuColorScheme === "string") {
    out.menuColorScheme = coerceSchemeNumber(out.menuColorScheme);
  }
  return out;
}
