# Playbook: Overriding a block in a specific theme

## When is override justified?

Only when Levels 1-3 of theme individuality (tokens / variant / style layer) cannot express what's needed.

If the needed change is:
- Different colors/radii/fonts → NOT an override, use tokens.json.
- Different layout at SAME props → NOT an override, add a variant to base.
- Decorative CSS additions → NOT an override, use styles/X.css.
- DIFFERENT PROPS (e.g., 1 image vs 2 images) → YES, override.
- Truly different markup structure → YES, override.

## Steps

### 1. Duplicate the block's 5 files into `theme-<name>/blocks/X/`

Same contract: 5 mandatory files, validateBlock must pass.

### 2. Declare in theme.json

```json
{
  "blocks": {
    "X": {
      "override": {
        "path": "./blocks/X",
        "reason": "ONE-SENTENCE-EXPLANATION"
      }
    }
  }
}
```

**`reason` is MANDATORY** — Zod schema rejects override without it.

### 3. If prop shape differs from base, add migrations

Create `blocks/X/X.migrations.ts`:

```typescript
export const XMigrations = {
  from: {
    base: { oldFieldName: 'newFieldName' },
    '*': { oldFieldName: 'newFieldName' },
  },
};
```

This tells the system how to remap stored Puck data when a site switches FROM another theme TO this one.

### 4. Run validateTheme

```bash
pnpm theme:validate --theme mytheme
```

Must pass.

## Common Mistakes

**Empty reason** → Zod rejects.

**No migrations, different props** → merchant data silently resets on theme switch. Always provide migrations if shape differs.

**Override when tokens or variant would suffice** → bloats theme code, drifts over time.
