// Протокол превью секций (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11): события между скриптом
// секций превью (storefront-build, preview-sections-agent.ts), скриптом превью (dist/preview.js) и ядром, сообщение
// конструктору. Файл без импортов: его читают ядро, скрипт превью и сборка магазина (вход @merfy/shell/preview).

// Скрипт секций превью → скрипт превью: событие на <merfy-section>, cancelable, detail — PreviewUpdateDetail. Скрипт
// превью отменяет событие, когда берёт правку себе; не отменил — скрипт секций превью меняет HTML сам, как в части 5б.
export const PREVIEW_UPDATE_EVENT = 'merfy:preview:update';
// Скрипт превью → ядро: заменить экземпляр, detail — PreviewReplaceDetail. Слушатель есть только у бандла превью.
export const PREVIEW_REPLACE_EVENT = 'merfy:preview:replace';
// Скрипт превью → странице, на document: замена закончилась, detail — SectionUpdated.
export const PREVIEW_UPDATED_EVENT = 'merfy:preview:updated';
// Скрипт превью → конструктору (postMessage): итог замены — { type, id, outcome, message }.
export const SECTION_UPDATED_MESSAGE = 'section-updated';
// Ядро → странице, на document: сбой экземпляра (design.md 3.7); скрипт секций превью (план 2) ставит секции красную
// рамку и подпись. То же имя, что SECTION_FAILURE_EVENT в core/events.ts.
export const SECTION_ERROR_EVENT = 'merfy:section:error';
// Скрипт секций превью → ядру (блок 6, часть 6в; В6-1 А): мерчант выбрал блок секции в панели слева или снял выбор.
// Событие на первом узле блока (data-merfy-block) внутри <merfy-section>, всплывает, detail — { blockId }. Имена — из
// каталога событий: ядро отдаёт событие только экземпляру этой секции, секция слушает его через ctx.listen.
export const BLOCK_SELECT_EVENT = 'merfy:block:select';
export const BLOCK_DESELECT_EVENT = 'merfy:block:deselect';
// JSON-тег с текстом бандла страницы превью: строка JSON, её пишет сборщик перед dist/preview.js.
export const PREVIEW_BUNDLE_TAG_ID = 'merfy-preview-bundle';
// Загрузок кода секций без перезагрузки превью: старые модули остаются в памяти страницы. Двадцатая — перезагрузка.
export const REPLACE_LIMIT = 20;
// Длина текста в сообщениях конструктору — как у render-error (src/lib/previewSandbox.ts конструктора).
export const MESSAGE_MAX_LENGTH = 2000;
// Хеш кода секции — sha256, 64 знака hex: тот же, что script строки списка секций бандла.
export const SCRIPT_HASH = /^[0-9a-f]{64}$/;
// Модуль «Каталог» (блок 11 «Секций и SDK», план 11б-2) → скрипту секций превью: событие на узле внутри <merfy-section>,
// всплывает, cancelable, detail — PreviewListDetail. В превью нет раздачи: скрипт секций превью отменяет событие,
// запрашивает блок заново с параметрами списка, ставит стили блока и отдаёт HTML секции в reply — вставляет его модуль,
// как ответ раздачи на сайте. Не отменено — превью не знает этот блок, модуль оставляет список как есть.
export const PREVIEW_LIST_EVENT = 'merfy:preview:list';

export interface PreviewListDetail {
  readonly list: string; // параметры списка в каноническом виде (listQueryString сборки); '' — без параметров
  readonly reply: (html: string) => void; // HTML одной <merfy-section> из ответа превью; ошибка запроса — не вызывается
}

// Итог замены у ядра; очередь скрипта превью добавляет superseded (пришла правка новее) и absent (секции нет).
export type ReplaceOutcome = 'kept-state' | 'fresh' | 'failed' | 'reloaded';
export type UpdateOutcome = ReplaceOutcome | 'superseded' | 'absent';

// Код секции из ответа /preview/section (план 2): модуль без импортов — export default { mount, actions, unmount }.
export interface PreviewScript {
  readonly hash: string;
  readonly code: string;
  readonly uses: readonly string[]; // модули SDK для ctx — как uses строки списка секций бандла
}

export interface PreviewUpdateDetail {
  readonly html: string; // <merfy-section> экземпляра с тегом входных данных — из ответа /preview/section
  readonly script: PreviewScript | null; // null — у секции нет кода
  readonly codeOnly: boolean; // true — секция только что вставлена из этого HTML: перезапуск, только если сменился код
}

export interface PreviewCodeRef {
  readonly hash: string;
  readonly uses: readonly string[];
}

export interface PreviewReplaceDetail {
  readonly html: string;
  readonly script: PreviewCodeRef | null; // без текста кода: код загружает load()
  readonly codeOnly: boolean;
  readonly load: () => Promise<unknown>; // загрузить код секции; отдаёт export default модуля
  readonly reply: (outcome: ReplaceOutcome, message: string) => void; // ядро отвечает один раз
}

export interface SectionUpdated {
  readonly id: string;
  readonly outcome: UpdateOutcome;
  readonly message: string;
}

// Тексты итогов ядра.
export const REPLACE_TEXT = {
  wrongHtml: 'в ответе превью не этот экземпляр секции',
  notDefinition: 'модуль секции не отдал определение секции',
  gone: 'секции уже нет на странице',
} as const;
