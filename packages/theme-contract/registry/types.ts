export type Block = {
  name: string;
  label: string;
  category: 'media' | 'content' | 'commerce' | 'chrome' | 'account' | 'checkout';
  hidden?: boolean;
  paletteOrder: number;
  icon?: string;
  hasAstroRenderer: boolean;
  hasOverride: string[];
  siblings: string[];
  schemaJson: object;
  defaults: object;
};

export type Registry = {
  blocks: Block[];
  scannedAt: string;
  source: string;
};

export type ValidationError = {
  code:
    | 'MISSING_ASTRO'
    | 'BROKEN_IMPORT'
    | 'INVALID_SCHEMA'
    | 'ASSET_ASYMMETRY'
    | 'ORPHAN_OVERRIDE';
  block?: string;
  message: string;
  file?: string;
};

export type ValidationResult = {
  errors: ValidationError[];
  warnings: ValidationError[];
};
