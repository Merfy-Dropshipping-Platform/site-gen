/**
 * Product SEO resolution logic.
 *
 * Used by the product detail Astro template to compute SEO meta tags
 * with proper fallback chain:
 *   metaTitle -> product.name -> "Товар"
 *   metaDescription -> product.description (truncated to 160 chars) -> ""
 */

export interface ProductSeoInput {
  name: string;
  description?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export interface ProductSeoResult {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

const MAX_DESCRIPTION_LENGTH = 160;

/**
 * Resolve SEO fields for a product page with fallback logic.
 *
 * Priority:
 * - title: metaTitle (if non-empty) -> product name -> "Товар"
 * - description: metaDescription (if non-empty, NOT truncated) ->
 *   product description (truncated to 160 chars) -> ""
 * - ogTitle / ogDescription mirror title / description
 */
export function resolveProductSeo(input: ProductSeoInput): ProductSeoResult {
  const { name, description, metaTitle, metaDescription } = input;

  // Title resolution: metaTitle -> name -> fallback
  const resolvedTitle = isNonEmpty(metaTitle)
    ? metaTitle!.trim()
    : isNonEmpty(name)
      ? name.trim()
      : "Товар";

  // Description resolution: metaDescription -> truncated description -> ""
  let resolvedDescription: string;
  if (isNonEmpty(metaDescription)) {
    // User-provided metaDescription is used as-is (no truncation)
    resolvedDescription = metaDescription!.trim();
  } else if (isNonEmpty(description)) {
    // Fallback: truncate product description to 160 chars
    resolvedDescription = description!.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  } else {
    resolvedDescription = "";
  }

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    ogTitle: resolvedTitle,
    ogDescription: resolvedDescription,
  };
}

/** Check if a string value is non-empty (not null, undefined, or whitespace-only) */
function isNonEmpty(value: string | null | undefined): boolean {
  return value != null && value.trim().length > 0;
}
