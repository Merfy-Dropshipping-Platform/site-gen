/**
 * @merfy/editor -- Puck Editor integration for Merfy site builder.
 *
 * Re-exports:
 * - buildPuckConfig: theme registry -> Puck Config converter
 * - externalFields: product/collection external field factories
 * - PuckEditor: React wrapper component around @measured/puck
 */

// Config builder
export { buildPuckConfig } from './lib/buildPuckConfig';
export type {
  RegistryEntry,
  FieldDef,
  PuckConfig,
  PuckComponentConfig,
  PuckFieldConfig,
} from './lib/buildPuckConfig';

// External fields
export {
  createProductField,
  createCollectionField,
} from './lib/externalFields';
export type {
  ExternalFieldConfig,
  ExternalFieldItem,
  ExternalField,
} from './lib/externalFields';

// Editor component
export { PuckEditor } from './PuckEditor';
export type { PuckEditorProps } from './PuckEditor';
