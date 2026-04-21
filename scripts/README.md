# sites service scripts

One-off and support scripts. Running them usually requires `DATABASE_URL` pointing at prod (or staging).

## `backfill-theme-colorschemes.ts` — spec 079 Phase 0b

Replaces `site_revision.data.themeSettings.colorSchemes` with the merchant-shape equivalent of the site's theme manifest, but ONLY when the existing value deep-equals the legacy Rose-generic seed. Sites whose merchants edited the schemes are left alone.

**Dry-run (default):**
```bash
DATABASE_URL=$PROD_URL pnpm backfill:theme-schemes
```

**Execute:**
```bash
DATABASE_URL=$PROD_URL DRY_RUN=false pnpm backfill:theme-schemes
```

Writes originals to `site_revision_prebackfill` before updating. Idempotent — re-running finds nothing to migrate.

Expected prod counts (measured 2026-04-21):
- rewrite: 17 (15 rose + 2 vanilla)
- skip-customised: 43
- skip-no-theme: 64
- skip-no-schemes: 51

## `rollback-theme-colorschemes.ts` — spec 079 Phase 0b

Restores `site_revision.data` from the `site_revision_prebackfill` snapshot table.

**Dry-run (default) — lists what would happen:**
```bash
DATABASE_URL=$PROD_URL pnpm rollback:theme-schemes
```

**Targeted rollback (single revision):**
```bash
DATABASE_URL=$PROD_URL DRY_RUN=false REVISION_ID=<revision-uuid> pnpm rollback:theme-schemes
```

**Full rollback:**
```bash
DATABASE_URL=$PROD_URL DRY_RUN=false pnpm rollback:theme-schemes
```

Idempotent; running multiple times keeps restoring from the same snapshot.

## `compile-astro-blocks.mjs` / `compile-preview-tailwind.mjs`

Build-time asset compilation. Run from the Dockerfile — no manual invocation needed.

## `verify-astro-runtime.mjs`

Smoke test for Astro container in CI.
