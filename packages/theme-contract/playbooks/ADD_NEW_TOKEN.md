# Playbook: Adding a new CSS token to the registry

## When

You need a CSS variable that blocks will use, and it's not in `tokens/registry.ts`.

## Steps

### 1. Add to `tokens/registry.ts`

```typescript
'--my-new-token': { category: 'size', unit: 'px', scope: 'theme', min: 0, max: 100 },
```

Choose the right category (color / font / weight / size / radius / spacing / variant).

### 2. Add to `tokens/base-defaults.ts`

```typescript
'--my-new-token': '16px',
```

### 3. If you're the first consumer, also add to your block's `X.tokens.ts`

```typescript
export const XTokens = [
  // ...existing
  '--my-new-token',
] as const satisfies readonly `--${string}`[];
```

### 4. Run tests

```bash
pnpm --filter @merfy/theme-contract test
pnpm --filter @merfy/theme-base test
```

Both must stay green.

### 5. Commit

`feat(theme-contract): add --my-new-token CSS variable`

## Common Mistakes

**Add to registry but forget base-defaults** → tests fail ("defines a default for every token").

**Use --my-new-token in .astro without declaring in X.tokens.ts** → validateBlock fails.
