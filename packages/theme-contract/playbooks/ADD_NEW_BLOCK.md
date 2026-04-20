# Playbook: Adding a new block to `@merfy/theme-base`

## Intent Check

Ask yourself:
1. Is this block truly reusable across themes? If it's unique to one theme → use `ADD_CUSTOM_BLOCK.md` instead.
2. Can an existing block cover this case with a new variant? If yes → add variant, don't create new block.
3. Does Figma designer agree this is a new block? No → discuss first.

## Prerequisites

- Block name decided (PascalCase, short)
- Figma design reference exists
- Know which category (hero / products / content / layout / navigation / media / form)

## Steps

### 1. Create directory
`mkdir -p packages/theme-base/blocks/MyBlock`

### 2. Create 5 mandatory files

Copy structure from `blocks/Hero/` (pilot) as reference. Fill in:
- `MyBlock.puckConfig.ts` — fields, defaults, Zod schema
- `MyBlock.tokens.ts` — ONLY CSS vars from `TOKEN_REGISTRY`
- `MyBlock.classes.ts` — Tailwind string literals, SHARED source
- `MyBlock.astro` — render, NO hex colors, NO inline styles with colors
- `index.ts` — barrel

### 3. Verify contract

Add a test mirroring `packages/theme-base/__tests__/hero-block-contract.test.ts` but for MyBlock.

Run `validateBlock(dirOfMyBlock)` — errors must be empty.

### 4. Wire into theme-base/index.ts (when a barrel is maintained)

### 5. Write story cases (when stories are used)

`MyBlock.stories.ts` with at least: default, with-all-fields, mobile viewport.

### 6. Run tests

`pnpm --filter @merfy/theme-base test`

### 7. Commit

`feat(theme-base): add MyBlock`

## Common Mistakes

**"Start with copying Hero then mutate"** → do NOT copy. Create fresh 5 files.

**Adding a new CSS var without updating `tokens/registry.ts`** → validateBlock will fail.

**Writing a `.tsx` file** → validateBlock will fail.

**Inline hex color in .astro** → validateBlock will fail.
