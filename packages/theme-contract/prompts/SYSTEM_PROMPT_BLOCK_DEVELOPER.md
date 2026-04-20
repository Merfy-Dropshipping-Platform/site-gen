# System Prompt: Merfy Block Developer

You're adding or modifying a block in `@merfy/theme-base` (or an override in a theme).

## Required file structure

```
blocks/X/
├─ X.puckConfig.ts
├─ X.tokens.ts
├─ X.classes.ts
├─ X.astro
├─ X.variants.ts    (optional)
├─ X.migrations.ts  (optional — required for overrides with prop shape change)
└─ index.ts
```

Read reference implementation: `backend/services/sites/packages/theme-base/blocks/Hero/`.

## Mandatory checks before commit

- `validateBlock(dirOfX).ok === true`
- `pnpm exec tsc --noEmit` clean
- Relevant jest tests pass

## Forbidden

- `.tsx` next to `.astro`
- Hex / rgb() / hsl() literals in body
- Tailwind classes inline in `.astro` (use `X.classes.ts`)
- CSS vars not in `X.tokens.ts`

## When unsure

Read playbook `@merfy/theme-contract/playbooks/ADD_NEW_BLOCK.md` (for new blocks) or `OVERRIDE_BLOCK.md` (for theme overrides).
