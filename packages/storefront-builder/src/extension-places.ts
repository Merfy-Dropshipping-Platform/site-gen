import { autoPlacePart, type AutoPlace } from '@merfy/storefront-sections';
import type { DrawAnswer } from './draw';
import { jsonAnswer } from './stand-preview';
import type { VisibleSection } from './section-extension';

// Места по умолчанию секций расширений (блок 12 «Секций и SDK», часть 12д, Р12д-12): сборщик отдаёт sites, какие
// секции с autoPlace включённых расширений есть и у каких видимых секций место блоков — договор с sites описан в
// site-gen `src/extension-sections/extension-places.ts`. Имён расширений здесь нет: автор — префикс имени секции.

export const EXTENSION_PLACES_ROUTE = '/sections/places';

export interface ExtensionPlace {
  readonly section: string; // полное имя «<id расширения>:<имя>»
  readonly autoPlace: AutoPlace;
  readonly hosts: readonly string[]; // имена видимых секций с частью места в script_meta, по алфавиту
}

// Автор секции (имя до «:») — расширение, не shop и не platform.
const ofExtension = (name: string): boolean => {
  const author = name.slice(0, name.indexOf(':'));
  return author !== '' && author !== 'shop' && author !== 'platform';
};

// Секция расширения с местом по умолчанию: hosts — видимые секции с частью места в script_meta, по алфавиту.
function placeOf(name: string, section: VisibleSection, others: ReadonlyMap<string, VisibleSection>): ExtensionPlace | null {
  const place = section.manifest.autoPlace;
  if (place === undefined) return null;
  const wanted = autoPlacePart(place);
  const hosts = [...others]
    .filter(([, one]) => {
      if (one.manifest.kind !== 'section') return false;
      const parts: readonly string[] = one.scriptMeta?.parts ?? [];
      return parts.includes(wanted);
    })
    .map(([one]) => one)
    .sort();
  return { section: name, autoPlace: place, hosts };
}

// Видимые секции вида section; автор (имя до «:») не shop и не platform; есть manifest.autoPlace. hosts — секции, у
// которых scriptMeta?.parts содержит autoPlacePart(autoPlace). По имени секции.
export function placesOf(sections: ReadonlyMap<string, VisibleSection>): ExtensionPlace[] {  return [...sections]
    .filter(([name, one]) => one.manifest.kind === 'section' && ofExtension(name))
    .flatMap(([name, one]) => {
      const place = placeOf(name, one, sections);
      return place === null ? [] : [place];
    });
}

export interface PlacesDeps {
  shop: (rawShop: string | null) => Promise<{ shopId: string } | DrawAnswer>;
  sections: (shopId: string) => Promise<ReadonlyMap<string, VisibleSection> | null>;
}

// GET /sections/places?shop=: deps.shop(raw) вернул ответ ('status' in …) — он; deps.sections(shopId) — null → 502
// { problems: ['сервис расширений не ответил'] }; иначе jsonAnswer(200, { places }).
export async function extensionPlaces(deps: PlacesDeps, rawShop: string | null): Promise<DrawAnswer> {
  const found = await deps.shop(rawShop);
  if ('status' in found) return found;
  const sections = await deps.sections(found.shopId);
  if (sections === null) return jsonAnswer(502, { problems: ['сервис расширений не ответил'] });
  return jsonAnswer(200, { places: placesOf(sections) });
}
