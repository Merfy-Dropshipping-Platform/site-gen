/**
 * Recursive {{VAR}} substitution for nested data structures.
 * Used by collection page rendering to inject collection.title, .description, .image
 * into Puck JSON before passing to Astro components.
 *
 * Unknown vars are left as-is (e.g. `{{UNKNOWN}}` stays literal).
 */
export function substituteTemplateVars(
  input: unknown,
  vars: Record<string, string>,
): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return vars[key] !== undefined ? String(vars[key]) : match;
    });
  }
  if (Array.isArray(input)) {
    return input.map((item) => substituteTemplateVars(item, vars));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = substituteTemplateVars(v, vars);
    }
    return out;
  }
  return input;
}
