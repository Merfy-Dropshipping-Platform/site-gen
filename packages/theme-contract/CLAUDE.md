# @merfy/theme-contract — AI Rules

**Role of this package:** Single source of truth for Merfy theme system. All types, validators, resolvers, tokens, playbooks live here.

## Terminology (do NOT invent synonyms)

- **Block** — a section editable via Puck. 5 mandatory files: `X.puckConfig.ts`, `X.tokens.ts`, `X.classes.ts`, `X.astro`, `index.ts`.
- **Chrome** — Header / Footer / AuthModal / CartDrawer / Layouts — same contract as content blocks, usually overridden per theme.
- **Override** — theme ships its own version of a block. Requires `reason` in `theme.json`. See `playbooks/OVERRIDE_BLOCK.md`.
- **Variant** — layout variation of a block at same props. Lives in base (`X.variants.ts`). Theme picks via `theme.json → blocks.X.variant`.
- **Custom Block** — block existing only in one theme. Requires `requiredFeatures` feature flag.
- **Token Registry** — `tokens/registry.ts` — whitelist of ~40 CSS custom properties. Any CSS var NOT in registry fails validators.
- **Token Cascade** — `merchantOverrides → theme.colorSchemes[N] → theme.defaults → BASE_DEFAULTS`.

## Five Levels of Theme Individuality (use in order)

Always start at Level 1. Move up only when Level N cannot express what's needed.

1. **Tokens** — change `tokens.json` value. No code change.
2. **Variant** — pick `blocks.X.variant` from base variants. No code change.
3. **Style Layer** — add `styles/X.css` in theme. One CSS file.
4. **Override** — ship `blocks/X/` in theme with 5 files + `reason`.
5. **Custom Block** — ship unique block with `requiredFeatures`.

## Red Flags

- "Let me copy rose as a starting point" → STOP. Use `extends: "@merfy/theme-base"` + `tokens.json`.
- "Hardcode #f472b6 just for now" → STOP. Add to tokens.json.
- "Add a new CSS var inline" → STOP. First extend `TOKEN_REGISTRY` via playbook.
- "Write Hero.tsx next to Hero.astro" → STOP. Renderer is Astro-only.

## Before Adding Types / Validators / Tokens

- Check existing exports in `types.ts`, `tokens/registry.ts`, `validators/`.
- If adding a CSS var: update `tokens/registry.ts` + `tokens/base-defaults.ts`. Nothing else compiles without both.
- If adding a validator: wire into `validators/validateTheme.v2.ts` so it runs on every `pnpm theme:validate`.

## Playbooks — read before acting

- Creating a theme: `playbooks/CREATE_NEW_THEME.md`
- Adding a block to base: `playbooks/ADD_NEW_BLOCK.md`
- Overriding a block: `playbooks/OVERRIDE_BLOCK.md`
- Custom block in a theme: `playbooks/ADD_CUSTOM_BLOCK.md`
- New token: `playbooks/ADD_NEW_TOKEN.md`
- Migrating to new base version: `playbooks/MIGRATE_THEME_TO_NEW_BASE.md`
