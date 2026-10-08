import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type _Object,
} from '@aws-sdk/client-s3';
import { StorefrontStorageError } from './errors';
import type { ListedObject, ObjectStore, StoredObject, WriteCondition, WriteOptions, WriteResult } from './store';

// Хранилище S3 (MinIO). Условная запись — только через aws-sdk: клиент minio условные заголовки не шлёт, а MinIO
// той версии, что на dev и в проде, If-Match и If-None-Match проверяет (design.md блока 5, факты 10 и 11).

export interface S3StoreOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface Target {
  client: S3Client;
  bucket: string;
}

const NOT_FOUND = 404;
// 412 — условие не выполнено; 409 — в этот момент идёт другая условная запись того же объекта (так отвечает S3).
const CONFLICT_STATUSES = new Set([409, 412]);
const DELETE_BATCH = 1000;

const statusOf = (error: unknown): number | undefined =>
  error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;

const failed = (what: string, error: unknown): StorefrontStorageError =>
  new StorefrontStorageError('store-failed', 'хранилище ответило ошибкой', { path: what, cause: error });

function conditionHeaders(condition: WriteCondition | undefined): { IfMatch?: string; IfNoneMatch?: string } {
  if (condition === undefined) return {};
  if ('ifMatch' in condition) return { IfMatch: condition.ifMatch };
  return { IfNoneMatch: condition.ifNoneMatch };
}

async function read(target: Target, key: string): Promise<StoredObject | null> {
  try {
    const response = await target.client.send(new GetObjectCommand({ Bucket: target.bucket, Key: key }));
    const body = await response.Body?.transformToByteArray();
    return { body: body ?? new Uint8Array(), etag: response.ETag ?? '' };
  } catch (error) {
    if (statusOf(error) === NOT_FOUND) return null;
    throw failed(key, error);
  }
}

async function has(target: Target, key: string): Promise<boolean> {
  try {
    await target.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: key }));
    return true;
  } catch (error) {
    if (statusOf(error) === NOT_FOUND) return false;
    throw failed(key, error);
  }
}

async function write(target: Target, key: string, body: Uint8Array, options: WriteOptions): Promise<WriteResult> {
  const command = new PutObjectCommand({
    Bucket: target.bucket,
    Key: key,
    Body: body,
    ContentType: options.contentType,
    ...conditionHeaders(options.condition),
  });
  try {
    const response = await target.client.send(command);
    return { written: true, etag: response.ETag ?? '' };
  } catch (error) {
    if (CONFLICT_STATUSES.has(statusOf(error) ?? 0)) return { written: false };
    throw failed(key, error);
  }
}

const listedOf = (object: _Object): ListedObject[] =>
  object.Key === undefined || object.LastModified === undefined
    ? []
    : [{ key: object.Key, modifiedAt: object.LastModified.toISOString() }];

async function list(target: Target, prefix: string): Promise<ListedObject[]> {
  const listed: ListedObject[] = [];
  let token: string | undefined;
  try {
    do {
      const command = new ListObjectsV2Command({ Bucket: target.bucket, Prefix: prefix, ContinuationToken: token });
      const page = await target.client.send(command);
      listed.push(...(page.Contents ?? []).flatMap(listedOf));
      token = page.NextContinuationToken;
    } while (token !== undefined);
  } catch (error) {
    throw failed(prefix, error);
  }
  return listed;
}

const batchesOf = (keys: readonly string[]): string[][] =>
  Array.from({ length: Math.ceil(keys.length / DELETE_BATCH) }, (_, index) =>
    keys.slice(index * DELETE_BATCH, (index + 1) * DELETE_BATCH),
  );

async function removeBatch(target: Target, keys: readonly string[]): Promise<void> {
  const objects = keys.map((key) => ({ Key: key }));
  const command = new DeleteObjectsCommand({ Bucket: target.bucket, Delete: { Objects: objects, Quiet: true } });
  const response = await target.client.send(command).catch((error: unknown) => {
    throw failed(keys[0] ?? '', error);
  });
  const [first] = response.Errors ?? [];
  if (first !== undefined) throw failed(first.Key ?? '', first.Message);
}

async function remove(target: Target, keys: readonly string[]): Promise<void> {
  for (const batch of batchesOf(keys)) await removeBatch(target, batch);
}

export function createS3Store(options: S3StoreOptions): ObjectStore {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });
  const target: Target = { client, bucket: options.bucket };
  return {
    read: (key) => read(target, key),
    has: (key) => has(target, key),
    write: (key, body, writeOptions) => write(target, key, body, writeOptions),
    list: (prefix) => list(target, prefix),
    remove: (keys) => remove(target, keys),
  };
}
