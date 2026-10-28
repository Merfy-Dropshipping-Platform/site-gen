// Снимок одной секции (28.10): вместо экранов страницы — вырезка этой секции на каждом устройстве. Секция ищется по id
// экземпляра (`data-section-id`, как в `merfy_pages · outline`); место и сама съёмка — в `look-page.ts`, здесь — выбор
// качества под предел веса и ответ «секции нет на странице».
import { QUALITY_STEPS, base64Size } from './look-fit';
import { LookError, type PageSession, type SectionPlace } from './look-types';

export interface SectionCut {
  // Высота секции на странице и сколько из неё на снимке (сверху); `pinned` — снята без прокрутки, прибита к экрану.
  height: number;
  shown: number;
  pinned: boolean;
}

export interface SectionShots {
  // Места секции по устройствам (порядок сессий); `null` — на этом устройстве секции не видно.
  places: Array<SectionPlace | null>;
  // JPEG секции по устройствам; `null` там, где её не видно.
  shots: Array<Uint8Array | null>;
}

export const cutOf = (place: SectionPlace): SectionCut => ({
  height: place.fullHeight,
  shown: place.height,
  pinned: place.pinned,
});

// Секция нужна хотя бы на одном устройстве: скрытая на телефоне и видимая на компьютере — не ошибка запроса.
export async function locateSection(sessions: PageSession[], section: string): Promise<Array<SectionPlace | null>> {
  const places = await Promise.all(sessions.map((session) => session.locateSection(section)));
  if (places.every((place) => place === null)) {
    throw new LookError(
      'section-not-found',
      'Не нашёл секцию на странице превью: её нет в черновике этой страницы или она скрыта',
    );
  }
  return places;
}

const weightOf = (shots: Array<Uint8Array | null>): number =>
  shots.reduce((sum, shot) => sum + (shot === null ? 0 : base64Size(shot.length)), 0);

// Снимает секцию на каждом устройстве: сначала лучшее качество, при перевесе — следующее. Высота секции уже ограничена
// (`SECTION_MAX_HEIGHT`), поэтому на худшем качестве предел выдерживается и без обрезки вниз.
export async function shootSections(
  sessions: PageSession[],
  places: Array<SectionPlace | null>,
  section: string,
  budget: number,
): Promise<SectionShots> {
  let shots: Array<Uint8Array | null> = [];
  for (const quality of QUALITY_STEPS) {
    shots = await Promise.all(
      sessions.map((session, index) => {
        const place = places[index];
        return place === null || place === undefined
          ? Promise.resolve(null)
          : session.shootSection(place, section, quality);
      }),
    );
    if (weightOf(shots) <= budget) break;
  }
  return { places, shots };
}
