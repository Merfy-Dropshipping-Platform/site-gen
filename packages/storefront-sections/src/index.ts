// @merfy/storefront-sections — приём кода секций (блок 7): одна функция приёма для всех авторов, двери, реестр секций.
export { acceptSection, type AcceptDeps, type AcceptResult } from './accept';
export { doorFields, doorSchema, type Door, type DoorFields, type SectionAuthor } from './doors';
export {
  SECTION_GROUPS,
  SECTION_KINDS,
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
