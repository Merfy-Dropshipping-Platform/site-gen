# @merfy/editor

Puck visual page builder integration for Merfy backOffice. Converts theme component registries into Puck configs and provides external fields for product/collection selection.

## Exports

```
@merfy/editor                    -> buildPuckConfig, PuckEditor, createProductField, createCollectionField
@merfy/editor/lib/buildPuckConfig -> buildPuckConfig (standalone)
@merfy/editor/lib/externalFields  -> createProductField, createCollectionField
```

Peer dependencies: `@measured/puck >=0.18.0`, `react >=18`, `react-dom >=18`.

## buildPuckConfig

Converts a theme's `RegistryEntry[]` into a Puck-compatible `Config` object.

```ts
import { buildPuckConfig } from "@merfy/editor";

const registry: RegistryEntry[] = [
  {
    name: "HeroBanner",
    label: "Hero Banner",
    category: "hero",
    schema: {
      heading: { type: "text", label: "Heading" },
      size: { type: "select", label: "Size", options: [
        { label: "Small", value: "small" },
        { label: "Large", value: "large" },
      ]},
    },
    defaultProps: { heading: "Welcome", size: "large" },
  },
];

const config = buildPuckConfig(registry, { variants: true, collections: true });
// -> { components: { HeroBanner: { label, fields, defaultProps } }, root: { ... } }
```

Feature-gated: entries with `puckConfig.requiredFeature` are excluded when the feature is disabled.

### Field Types

Schema fields map to Puck field types:

| Schema Type | Puck Type | Notes |
|-------------|-----------|-------|
| `text` | `text` | Single-line text |
| `textarea` | `textarea` | Multi-line text |
| `number` | `number` | With optional min/max |
| `select` | `select` | Dropdown with options |
| `radio` | `radio` | Radio group with options |
| `color` | `color` | Color picker |
| `external` | `custom` | External data field |
| `object` | `object` | Nested fields via objectFields |
| `array` | `array` | List via arrayFields |

## External Fields

Factory functions that create Puck external fields for selecting products/collections from the Store API at runtime.

```ts
import { createProductField, createCollectionField } from "@merfy/editor";

const productField = createProductField({
  apiBaseUrl: "https://api.merfy.ru",
  shopId: "shop_abc123",
});

const collectionField = createCollectionField({
  apiBaseUrl: "https://api.merfy.ru",
  shopId: "shop_abc123",
});
```

Product field fetches from `GET /store/products/search?store_id=X&q=Y&limit=20`.
Collection field fetches from `GET /store/collections?store_id=X` with client-side filtering.

## PuckEditor Component

Thin wrapper around `@measured/puck` Puck component.

```tsx
import { PuckEditor } from "@merfy/editor";

<PuckEditor
  config={puckConfig}     // from buildPuckConfig()
  data={pageData}         // Puck Data JSON (from pages/*.json)
  onSave={(data) => {     // called on Publish click
    savePage(data);
  }}
  onPublish={() => {      // optional post-save callback
    triggerDeploy();
  }}
/>
```

Props:
- `config: Config` -- Puck component config (from `buildPuckConfig`)
- `data: Data` -- Current page data (Puck JSON)
- `onSave: (data: Data) => void` -- Save callback
- `onPublish?: () => void` -- Optional post-save hook
