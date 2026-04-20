import { TOKEN_REGISTRY, type TokenKey, type TokenMeta } from '../tokens/registry';

export interface ValidateTokensResult {
  ok: boolean;
  errors: string[];
}

export function validateTokens(tokens: Record<string, string>): ValidateTokensResult {
  const errors: string[] = [];

  for (const [key, rawValue] of Object.entries(tokens)) {
    if (!(key in TOKEN_REGISTRY)) {
      errors.push(`Unknown token "${key}" — not in TOKEN_REGISTRY`);
      continue;
    }

    const meta: TokenMeta = TOKEN_REGISTRY[key as TokenKey];

    // Enum validation for variant tokens
    if (meta.values) {
      if (!meta.values.includes(rawValue)) {
        errors.push(`Token "${key}" = "${rawValue}" — must be one of: ${meta.values.join(', ')}`);
      }
      continue;
    }

    // Numeric min/max for size/radius/spacing
    if (meta.min !== undefined || meta.max !== undefined) {
      const n = parseFloat(rawValue);
      if (!Number.isNaN(n)) {
        if (meta.min !== undefined && n < meta.min) {
          errors.push(`Token "${key}" = ${n} below min ${meta.min}`);
        }
        if (meta.max !== undefined && n > meta.max) {
          errors.push(`Token "${key}" = ${n} exceeds max ${meta.max}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
