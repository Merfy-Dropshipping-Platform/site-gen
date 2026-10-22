// @merfy/storefront-sections — приём кода секций (блок 7): одна функция приёма для всех авторов, двери, реестр секций.
export { acceptSection, type AcceptDeps, type AcceptResult } from './accept';
export { doorFields, doorSchema, type Door, type DoorFields, type SectionAuthor } from './doors';
export { SECTION_KINDS, readManifest, type SectionFiles, type SectionKind, type SectionManifest } from './format';
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
export { type SectionField } from './fields';
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
