# @merfy/theme-vanilla

Merfy vanilla storefront theme — olive-green flat design system.

Signature: Bitter + Arsenal fonts, container 1320px, radii 0px, 4 olive color schemes.

## Cascade

```
theme-base (neutral defaults)
   ↓
theme-vanilla (olive + flat tokens + Header/Footer overrides)
```

## Structure

```
packages/theme-vanilla/
├─ theme.json          — manifest (tokens + colorSchemes + blocks overrides)
├─ tokens.json         — W3C design tokens
├─ index.ts            — barrel
├─ blocks/
│   ├─ Header/         — 5-file override (Header.astro, .classes.ts, .tokens.ts, .puckConfig.ts, index.ts)
│   └─ Footer/         — 5-file override with powered-by bar
├─ customBlocks/       — vanilla-only blocks (deferred)
├─ __tests__/          — jest contract tests
└─ __snapshots__/      — playwright visual regression
```

## Tests

```bash
pnpm --filter @merfy/theme-vanilla test          # contract tests
pnpm --filter @merfy/theme-vanilla test:visual   # visual snapshots
```
