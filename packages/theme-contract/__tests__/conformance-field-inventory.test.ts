import { inventoryFields } from '../conformance/field-inventory';
import type {
  FieldInventoryInput,
  FieldInventoryBlockInput,
} from '../conformance/field-inventory';
import type { CapabilityRecord } from '../conformance/types';
import { makeCapabilityId } from '../conformance/ids';

// ---------------------------------------------------------------------------
// Focused fixture (mirrors the Bloom Catalog + Slideshow field shapes) covering
// every bullet the plan requires of the field inventory:
//   - nested object and array fields
//   - productCard.nextPhoto + root-level showFilter conditions
//   - concrete/normalized pointers
//   - sibling order preserved after output sorting
//   - min/max/step/maxItems/maxInstances, manifest constraints, option label/value
//   - deterministic scenario ids/orders/roles/values + mode/viewport applicability
//   - physical-only Benefits without promotion to authoring
//   - hidden/decorative PASS vs editable UNKNOWN
// ---------------------------------------------------------------------------

const catalogRuntime: FieldInventoryBlockInput['runtime'] = {
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    ['_section_card']: { type: 'section-header', label: 'Карточка товара' },
    productCard: {
      type: 'object',
      label: '',
      objectFields: {
        cardStyle: {
          type: 'select',
          label: 'Вид изображения',
          options: [
            { label: 'Авто', value: 'auto' },
            { label: 'Квадрат', value: 'square' },
          ],
        },
        nextPhoto: {
          type: 'toggle',
          label: 'Следующее фото при наведении',
          options: [
            { label: 'Вкл', value: 'true' },
            { label: 'Выкл', value: 'false' },
          ],
        },
        nextPhotoMode: {
          type: 'select',
          label: 'Режим следующего фото',
          options: [
            { label: 'Просто следующее', value: 'simple' },
            { label: 'Зоны при наведении', value: 'zones' },
          ],
          visibleWhen: { field: 'productCard.nextPhoto', equals: 'true' },
        },
      },
    },
    showFilter: {
      type: 'toggle',
      label: 'Фильтры',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    filterPosition: {
      type: 'radio',
      label: 'Вид фильтра',
      options: [
        { label: 'Сверху', value: 'top' },
        { label: 'Сбоку', value: 'side' },
      ],
      visibleWhen: { field: 'showFilter', equals: 'true' },
    },
    columns: { type: 'number', label: 'Колонок', min: 2, max: 5, step: 1 },
    legacyHidden: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Каталог',
    productCard: { cardStyle: 'auto', nextPhoto: 'false', nextPhotoMode: 'simple' },
    showFilter: 'true',
    filterPosition: 'top',
    columns: 3,
  },
};

const slideshowRuntime: FieldInventoryBlockInput['runtime'] = {
  fields: {
    slides: {
      type: 'array',
      label: 'Слайды (макс 5)',
      max: 5,
      arrayFields: {
        heading: { type: 'text', label: 'Заголовок' },
        colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
      },
      defaultItemProps: { id: '', heading: '' },
    },
  },
  defaults: {
    slides: [{ id: 'slide-1', heading: 'Слайд-шоу' }],
  },
};

function baseInput(): FieldInventoryInput {
  return {
    theme: 'bloom',
    colorSchemeIds: ['scheme-1', 'scheme-2'],
    blocks: [
      {
        name: 'Catalog',
        maxInstances: 1,
        rawConstraints: { padding: { min: 0, max: 160, step: 8 } },
        runtime: catalogRuntime,
      },
      {
        name: 'Slideshow',
        maxInstances: null,
        runtime: slideshowRuntime,
      },
      {
        // Physical-only block: discovered on disk, NOT in authoring runtime.
        name: 'Benefits',
        maxInstances: null,
        physicalRaw: {
          fields: { title: { type: 'text', label: 'Заголовок' } },
          defaults: { title: 'Преимущества' },
        },
      },
    ],
  };
}

function byId(rows: CapabilityRecord[]): Map<string, CapabilityRecord> {
  return new Map(rows.map((r) => [r.id, r]));
}

describe('inventoryFields — recursion and pointers', () => {
  it('emits rows for nested object leaves and array-item leaves', () => {
    const rows = inventoryFields(baseInput());
    const ids = byId(rows);
    expect(
      ids.has(makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.cardStyle')),
    ).toBe(true);
    expect(
      ids.has(makeCapabilityId('bloom', 'block', 'Slideshow', 'slides[].heading')),
    ).toBe(true);
  });

  it('uses a concrete /0/ default pointer and a normalized /*/ pointer for array items', () => {
    const rows = inventoryFields(baseInput());
    const slideHeading = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Slideshow', 'slides[].heading'),
    )!;
    const def = (slideHeading.defaults ?? []).find((d) => d.source === 'array-item');
    expect(def).toBeDefined();
    expect(def!.pointer).toBe('/slides/0/heading');
    expect(def!.normalizedPointer).toBe('/slides/*/heading');
  });

  it('records container kinds: object, array, leaf, decorative', () => {
    const rows = inventoryFields(baseInput());
    const ids = byId(rows);
    expect(ids.get(makeCapabilityId('bloom', 'block', 'Catalog', 'productCard'))!.container).toBe(
      'object',
    );
    expect(ids.get(makeCapabilityId('bloom', 'block', 'Slideshow', 'slides'))!.container).toBe(
      'array',
    );
    expect(ids.get(makeCapabilityId('bloom', 'block', 'Catalog', 'columns'))!.container).toBe(
      'leaf',
    );
  });
});

describe('inventoryFields — sibling order survives output sorting', () => {
  it('rows are sorted by id but each keeps its zero-based source sibling order', () => {
    const rows = inventoryFields(baseInput());
    // Output is sorted by id.
    const sortedIds = rows.map((r) => r.id);
    const reSorted = [...sortedIds].sort();
    expect(sortedIds).toEqual(reSorted);

    const ids = byId(rows);
    // productCard.objectFields insertion order: cardStyle=0, nextPhoto=1, nextPhotoMode=2
    expect(
      ids.get(makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.cardStyle'))!.order,
    ).toBe(0);
    expect(
      ids.get(makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.nextPhoto'))!.order,
    ).toBe(1);
    expect(
      ids.get(makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.nextPhotoMode'))!.order,
    ).toBe(2);
  });
});

describe('inventoryFields — constraints and options', () => {
  it('captures min/max/step for numeric fields', () => {
    const rows = inventoryFields(baseInput());
    const columns = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'columns'),
    )!;
    expect(columns.constraints).toMatchObject({ min: 2, max: 5, step: 1 });
  });

  it('captures array maxItems and per-component maxInstances', () => {
    const rows = inventoryFields(baseInput());
    const slides = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Slideshow', 'slides'),
    )!;
    expect(slides.constraints?.maxItems).toBe(5);
    expect(slides.constraints?.maxInstances).toBe(null);
  });

  it('captures select option labels and values', () => {
    const rows = inventoryFields(baseInput());
    const cardStyle = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.cardStyle'),
    )!;
    expect(cardStyle.constraints?.options).toEqual([
      { label: 'Авто', value: 'auto' },
      { label: 'Квадрат', value: 'square' },
    ]);
  });

  it('emits one non-conflicting block-metadata row carrying maxInstances + raw constraints', () => {
    const rows = inventoryFields(baseInput());
    const meta = byId(rows).get('bloom.block.Catalog.authoring-constraints');
    expect(meta).toBeDefined();
    expect(meta!.constraints?.maxInstances).toBe(1);
    expect(meta!.constraints?.manifest).toMatchObject({ padding: { min: 0, max: 160, step: 8 } });
    // must not collide with the structural bloom.block.Catalog row
    expect(rows.some((r) => r.id === 'bloom.block.Catalog')).toBe(false);
    // block-wide constraints are NOT copied into every field row
    const heading = byId(rows).get(makeCapabilityId('bloom', 'block', 'Catalog', 'heading'))!;
    expect(heading.constraints?.maxInstances).toBeUndefined();
  });
});

describe('inventoryFields — visibleWhen resolution to canonical target IDs', () => {
  it('resolves a fully-qualified nested target (productCard.nextPhoto) from a nested field', () => {
    const rows = inventoryFields(baseInput());
    const mode = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.nextPhotoMode'),
    )!;
    expect(mode.conditionTargetId).toBe(
      makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.nextPhoto'),
    );
    expect(mode.conditionEquals).toBe('true');
  });

  it('resolves a root-level target (showFilter) from a root field', () => {
    const rows = inventoryFields(baseInput());
    const fp = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'filterPosition'),
    )!;
    expect(fp.conditionTargetId).toBe(
      makeCapabilityId('bloom', 'block', 'Catalog', 'showFilter'),
    );
  });
});

describe('inventoryFields — status of hidden/decorative vs editable', () => {
  it('hidden and decorative section-header rows start PASS', () => {
    const rows = inventoryFields(baseInput());
    const ids = byId(rows);
    const hidden = ids.get(makeCapabilityId('bloom', 'block', 'Catalog', 'legacyHidden'))!;
    expect(hidden.visibility).toBe('hidden');
    expect(hidden.status).toBe('PASS');
    const header = ids.get(makeCapabilityId('bloom', 'block', 'Catalog', '_section_card'))!;
    expect(header.visibility).toBe('decorative');
    expect(header.container).toBe('decorative');
    expect(header.status).toBe('PASS');
  });

  it('editable rows start UNKNOWN with empty caseResults', () => {
    const rows = inventoryFields(baseInput());
    const heading = byId(rows).get(makeCapabilityId('bloom', 'block', 'Catalog', 'heading'))!;
    expect(heading.editable).toBe(true);
    expect(heading.status).toBe('UNKNOWN');
    expect(heading.caseResults ?? []).toEqual([]);
  });
});

describe('inventoryFields — physical-only presence is not promoted to authoring', () => {
  it('records Benefits.title as physical-raw only, never runtime-authoring', () => {
    const rows = inventoryFields(baseInput());
    const title = byId(rows).get(makeCapabilityId('bloom', 'block', 'Benefits', 'title'))!;
    expect(title.presence).toEqual(['physical-raw']);
    expect(title.presence).not.toContain('runtime-authoring');
    expect(title.editable).toBe(false);
  });
});

describe('inventoryFields — deterministic scenario generation', () => {
  it('booleans/toggles get false then true in serialized string type, contiguous zero-based order', () => {
    const rows = inventoryFields(baseInput());
    const showFilter = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'showFilter'),
    )!;
    const roles = showFilter.scenarios.map((s) => s.role);
    expect(roles).toEqual(expect.arrayContaining(['false', 'true']));
    const falseCase = showFilter.scenarios.find((s) => s.role === 'false')!;
    const trueCase = showFilter.scenarios.find((s) => s.role === 'true')!;
    expect(falseCase.value).toBe('false');
    expect(trueCase.value).toBe('true');
    // ordered by (order,id); contiguous zero-based
    const orders = [...showFilter.scenarios]
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
      .map((s) => s.order);
    expect(orders).toEqual(orders.map((_, i) => i));
    // stable unique ids
    expect(new Set(showFilter.scenarios.map((s) => s.id)).size).toBe(
      showFilter.scenarios.length,
    );
  });

  it('select fields get one option scenario per labeled option', () => {
    const rows = inventoryFields(baseInput());
    const cardStyle = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.cardStyle'),
    )!;
    const optionValues = cardStyle.scenarios
      .filter((s) => s.role === 'option')
      .map((s) => s.value);
    expect(optionValues).toEqual(['auto', 'square']);
  });

  it('numeric fields get min/default/max plus one step boundary, all expected-valid', () => {
    const rows = inventoryFields(baseInput());
    const columns = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'columns'),
    )!;
    const roles = columns.scenarios.map((s) => s.role);
    expect(roles).toEqual(expect.arrayContaining(['min', 'default', 'max', 'step']));
    expect(columns.scenarios.find((s) => s.role === 'min')!.value).toBe(2);
    expect(columns.scenarios.find((s) => s.role === 'max')!.value).toBe(5);
    expect(columns.scenarios.every((s) => s.validity === 'expected-valid')).toBe(true);
  });

  it('text fields get empty/default and two safe synthetic A/B values', () => {
    const rows = inventoryFields(baseInput());
    const heading = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'heading'),
    )!;
    const roles = heading.scenarios.map((s) => s.role);
    expect(roles).toEqual(expect.arrayContaining(['empty', 'default', 'a', 'b']));
    expect(heading.scenarios.find((s) => s.role === 'empty')!.value).toBe('');
  });

  it('arrays get 0/1/maxItems with out-of-range 0 marked invalid-boundary', () => {
    const rows = inventoryFields(baseInput());
    const slides = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Slideshow', 'slides'),
    )!;
    const counts = slides.scenarios
      .filter((s) => s.role === 'array-count' || s.role === 'invalid-boundary')
      .map((s) => s.value)
      .sort((a: any, b: any) => a - b);
    expect(counts).toEqual([0, 1, 5]);
    // min is 1 => count 0 is invalid
    const zero = slides.scenarios.find((s) => s.value === 0)!;
    expect(zero.role).toBe('invalid-boundary');
    expect(zero.validity).toBe('expected-invalid');
  });

  it('colorScheme fields get one color-scheme scenario per runtime scheme id', () => {
    const rows = inventoryFields(baseInput());
    const cs = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Slideshow', 'slides[].colorScheme'),
    )!;
    const schemeValues = cs.scenarios
      .filter((s) => s.role === 'color-scheme')
      .map((s) => s.value);
    expect(schemeValues).toEqual(['scheme-1', 'scheme-2']);
  });

  it('conditional fields also get condition-on and condition-off combined scenarios', () => {
    const rows = inventoryFields(baseInput());
    const mode = byId(rows).get(
      makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.nextPhotoMode'),
    )!;
    const on = mode.scenarios.find((s) => s.role === 'condition-on')!;
    const off = mode.scenarios.find((s) => s.role === 'condition-off')!;
    const targetId = makeCapabilityId('bloom', 'block', 'Catalog', 'productCard.nextPhoto');
    // condition-on assigns the target's matching value.
    expect(on.assignments?.[targetId]).toBe('true');
    // condition-off assigns a deterministic nonmatching counterpart.
    expect(off.assignments?.[targetId]).toBe('false');
  });

  it('de-duplicates scenarios with stable deep equality while preserving order', () => {
    const rows = inventoryFields(baseInput());
    for (const r of rows) {
      const serialized = r.scenarios.map((s) => JSON.stringify([s.role, s.value, s.assignments ?? null]));
      // No two scenarios in a capability share role+value+assignments.
      expect(new Set(serialized).size).toBe(serialized.length);
    }
  });
});

describe('inventoryFields — mode/viewport applicability', () => {
  it('editable rows declare all three modes and both viewports', () => {
    const rows = inventoryFields(baseInput());
    const heading = byId(rows).get(makeCapabilityId('bloom', 'block', 'Catalog', 'heading'))!;
    expect(heading.modes).toEqual(['hot-preview', 'initial-preview', 'live']);
    expect(heading.viewports).toEqual(['desktop', 'mobile']);
  });
});

describe('inventoryFields — determinism', () => {
  it('produces byte-identical output across two runs regardless of object key order', () => {
    const a = inventoryFields(baseInput());
    const b = inventoryFields(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
