export interface ValidateSEOResult {
  ok: boolean;
  errors: string[];
}

export type SEOContext = 'page-root' | 'block' | 'layout';

const H1_RE = /<h1\b/gi;
const IMG_NO_ALT_RE = /<img(?![^>]*\balt=)[^>]*>/gi;

export function validateSEO(astroContent: string, context: SEOContext): ValidateSEOResult {
  const errors: string[] = [];
  const body = stripAstroFrontmatter(astroContent);

  // Exactly one h1 required in page-root context
  if (context === 'page-root') {
    const h1Matches = body.match(H1_RE);
    const count = h1Matches ? h1Matches.length : 0;
    if (count !== 1) {
      errors.push(`Expected exactly 1 <h1>, found ${count}`);
    }
  }

  // Every img must have alt (can be empty)
  const imgNoAltMatches = body.match(IMG_NO_ALT_RE);
  if (imgNoAltMatches && imgNoAltMatches.length > 0) {
    errors.push(`${imgNoAltMatches.length} <img> without alt attribute`);
  }

  return { ok: errors.length === 0, errors };
}

function stripAstroFrontmatter(content: string): string {
  const m = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  return m ? m[1] : content;
}
