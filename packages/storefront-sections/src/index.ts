// @merfy/storefront-sections — приём кода секций (блок 7): одна функция приёма для всех авторов, двери, реестр секций.
export { acceptSection, type AcceptDeps, type AcceptResult } from './accept';
export { doorFields, doorSchema, type Door, type DoorFields, type SectionAuthor } from './doors';
export {
  SECTION_GROUPS,
  SECTION_KINDS,
  propsUsesOf,
  readManifest,
  sectionGroupsOf,
  type SectionFiles,
  type SectionGroup,
  type SectionKind,
  type SectionManifest,
  type SectionUse,
} from './format';
export { prepareSection, type PrepareInput, type PrepareResult, type PreparedSection } from './prepare';
export { problemText, type ProblemCode, type SectionProblem } from './problems';
export { listSectionFolders, readSectionFolder } from './read-folder';
export {
  SECTION_AUTHORS,
  currentDraft,
  publishDrafts,
  rollbackSection,
  sectionHistory,
  visibleSections,
  type Database,
  type Queryable,
  type SectionRow,
  type Visibility,
} from './registry';
export { currentSection, type CurrentSection } from './current';
export { resolveSectionBlocks, type BlockValues, type ResolvedBlocks, type RevisionBlock } from './blocks';
export {
  isSettingField,
  settingFieldsOf,
  type SectionField,
  type SectionValue,
  type SettingsEntry,
  type WrapperRef,
} from './fields';
export {
  DEFAULT_WRAPPER_IDS,
  DEFAULT_WRAPPER_VIEW,
  STICKY_VIEW,
  WRAPPER_FIELDS,
  WRAPPER_IDS,
  isDefaultWrapperView,
  resolveWrapper,
  resolveWrapperView,
  wrapperIdsOf,
  wrapperView,
  type WrapperId,
  type WrapperValues,
} from './wrapper';
export { MAIN_MENU, menuTreeOf, revisionMenusSchema, sectionMenus, type RevisionMenu } from './menus';
export { defaultSettings, resolveSectionSettings, settingsTexts, type ResolvedSettings } from './settings';
// Текст статьи блога (блок 8 «Секций и SDK», часть 8а): очищает сборщик витрин до входов сборки.
export { cleanArticleHtml } from './richtext';
// Поля с записями (блок 8 «Секций и SDK», часть 8г): recordFields и data секции для входов сборки.
export { sectionRecordKeys } from './section-data';
export { DEFAULT_SANDBOX, prepareInWorker, type SandboxOptions } from './sandbox';
export {
  RENDER_LIMITS,
  SectionRenderError,
  startSectionRenderer,
  withSectionRenderer,
  type RenderLimits,
  type RendererOptions,
  type SectionRenderRequest,
  type SectionRenderer,
} from './render';
// Песочница процессов с чужим кодом (блок 2 «Секций и SDK»): бинарник Node и пользователь ОС, отчёт при старте.
export { defaultLaunch, readLaunch, type IsolatedLaunch } from './isolation';
export { sandboxReport, type SandboxReport } from './sandbox-report';
// Правила полей секции (блок 3 «Секций и SDK»): словарь имён и его текст для людей и ИИ, проверка имени, лимиты, тип
// значения поля по виду.
export { NAMES, type NameEntry, type NamesDictionary, type SdkKind } from './names';
export { nameIssue } from './name-check';
export { namesMarkdown } from './generate/names-markdown';
export { SETTINGS_LIMITS } from './limits';
export type { SettingValueOf } from './setting-value';

// Документация SDK и инструменты ИИ (блок 14 «Секций и SDK»): справка по кодам, ответ проверки, файлы для ИИ, данные
// для страниц документации.
export { PROBLEM_INFO, problemDoc, type ProblemInfo } from './problem-info';
export { sectionAnswer, type AnswerProblem, type SectionAnswer } from './answer';
export { AI_FILES, isAiFile, withoutAiFiles } from './ai-files';
export { PROBLEM_CODES, isWarning } from './problems';
export { SECTION_ID, SECTION_USES, SOURCE_LIMITS, sectionManifestSchema } from './format';
// Роли секций (блок 12 «Секций и SDK», часть 12а): таблица ролей и место секции с учётом роли.
export {
  OVERLAY_LIST,
  ROLE_LIMIT,
  ROLE_PLACES,
  SECTION_ROLES,
  roleKeysOf,
  type RoleKeys,
  type RolePlace,
  type SectionRole,
} from './roles';
export { listGroupOf, sectionLimitOf, sectionListAllowed } from './format';
export { SCRIPT_LIMITS } from './script';
export { MAX_TEMPLATE_DEPTH } from './depth';
export { FORBIDDEN_TAGS } from './template';
export { SDK_KINDS } from './names';

// Инструменты секций (блок 14, часть 14б): что видит конструктор и файлы текущей правки.
export { draftSource, editableSections, type DraftSource } from './registry';
