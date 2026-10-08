// @merfy/storefront-storage — хранилище по хэшу и указатель магазинов новой темы (design.md блока 5): заливка только
// нового, таблица раздачи, robots.txt и карта сайта, проверка перед переключением, указатель с откатом и паузой,
// списки дорисовок и адресов сущностей, уборка. Раздача, которая читает то, что пишет пакет, — nginx-minio-proxy,
// папка storefront/.

// Хранилище
export { createS3Store, type S3StoreOptions } from './s3-store';
export type { ListedObject, ObjectStore, StoredObject, WriteCondition, WriteOptions, WriteResult } from './store';
export { StorefrontStorageError, type StorefrontStorageErrorCode } from './errors';
export { UPDATE_ATTEMPTS, readObject, updateObject, writeObject, type Decision, type Updated } from './objects';

// Раскладка и форматы v1
export { STOREFRONT_PREFIX, blobKey, drawnKey, entitiesKey, hexOf, manifestKey, pointerKey, routesKey } from './layout';
export {
  CACHE_CLASSES,
  FORMAT_VERSION,
  HISTORY_LIMIT,
  parseDrawnList,
  parseEntityList,
  parsePointer,
  parseRoutesTable,
  type CacheClass,
  type DrawnList,
  type EntityList,
  type FileRow,
  type Pointer,
  type RoutesTable,
} from './formats';

// Выкладка
export { publishBuild, type PublishRequest, type PublishResult, type PublishStatus } from './publish';
export {
  PUBLISH_RULES,
  publishProblems,
  type PublishProblem,
  type PublishRule,
  type PublishRuleId,
} from './publish-rules';
export { UPLOAD_CONCURRENCY, uploadBuild, type UploadReport } from './upload';
export { GONE_DAYS, GONE_ENTITY_TYPES, NOT_FOUND_FILE, buildRoutesTable, type PreviousBuild } from './routes-table';
export { SITEMAP_LIMIT, seoFiles, type SeoFile, type SeoRequest } from './sitemap';
export { DEFAULT_CONTENT_TYPE, cacheClassOf, contentTypeOf } from './content-types';

// Указатель
export {
  changePointer,
  hasLiveBuild,
  nextPointer,
  readPointer,
  type PointerChange,
  type PointerIntent,
  type PointerOutcome,
} from './pointer';

// Списки и уборка
export { addEntityPaths, recordDrawnPage, removeEntityPaths, type DrawnPage, type ListOutcome } from './lists';
export {
  KEEP_LAST_BUILDS,
  KEEP_VERSION_PAIRS,
  KEEP_YOUNGER_MS,
  planCleanup,
  runCleanup,
  type CleanupPlan,
  type StoredBuild,
} from './cleanup';
