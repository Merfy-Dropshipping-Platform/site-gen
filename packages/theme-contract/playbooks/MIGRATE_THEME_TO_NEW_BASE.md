# Playbook: Migrating a theme after @merfy/theme-base breaking change

## When

`@merfy/theme-base` bumps major version. Theme's `extends: "@merfy/theme-base@workspace:*"` means it auto-adopts — but breaking changes may fail tests.

## Steps

### 1. Read BREAKING_CHANGES.md in `@merfy/theme-base`

Identify what changed (removed/renamed blocks, prop shape changes, etc.).

### 2. Run validation for your theme

```bash
pnpm theme:validate --theme mytheme
```

Fix each error.

### 3. If a base block removed, migrate:
- Accept the removal (if theme doesn't use it)
- Or override the block in your theme (ship your own version)

### 4. If a base block's props changed, update your migrations:
- Edit `theme-<name>/blocks/X/X.migrations.ts` if you override it
- Or accept data loss for that field on next merchant save

### 5. Run visual-diff

Any visual regression must be addressed before merge.

### 6. Commit

`chore(theme-<name>): upgrade to theme-base@<new-version>`

## Common Mistakes

**Skipping validateTheme** → stale schemas in production.

**Committing broken visuals** → merchants see regressions.
