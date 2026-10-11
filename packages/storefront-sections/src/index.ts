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
export { acceptReleases, type ReleaseDeps, type ReleaseFolder, type ReleaseLog, type ReleaseSummary } from './release';
export { DEFAULT_SANDBOX, prepareInWorker, type SandboxOptions } from './sandbox';
