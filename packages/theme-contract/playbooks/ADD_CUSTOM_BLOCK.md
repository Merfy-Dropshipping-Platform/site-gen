# Playbook: Adding a custom block (unique to one theme)

## When to create a custom block

The block exists in ONLY one theme (e.g., `BouquetShowcase` only for flower-catalog themes). Not reusable across themes.

## Steps

### 1. Directory: `theme-<name>/customBlocks/MyCustomBlock/`

Same 5-file contract.

### 2. Declare in theme.json

```json
{
  "features": {
    "flower-catalog": true
  },
  "customBlocks": {
    "MyCustomBlock": {
      "path": "./customBlocks/MyCustomBlock",
      "requiredFeatures": ["flower-catalog"]
    }
  }
}
```

The `requiredFeatures` array binds the block to a feature flag. If `features["flower-catalog"] !== true`, the block is hidden from the constructor.

### 3. Run validateTheme — must pass.

## Why feature-flag

When a merchant switches themes, custom blocks disappear from their page if the new theme doesn't have the feature. The block is REPLACED with a placeholder in the UI, not silently dropped.

## Common Mistakes

**Forgetting requiredFeatures** → block appears in every theme by accident.

**Putting custom block in base** → violates the principle that base is shared/cross-theme.
