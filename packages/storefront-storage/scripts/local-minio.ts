import { CreateBucketCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import type { S3StoreOptions } from '../src/s3-store';

// MinIO из compose.minio.yml (`pnpm minio:up`): учётка только этого стенда. Отсюда хранилище берут тесты на MinIO,
// проба условной записи и сверка «стенд → раздача».
export const LOCAL_MINIO: S3StoreOptions = {
  endpoint: 'http://127.0.0.1:19100',
  bucket: 'storefront-test',
  accessKeyId: 'storefront-test',
  secretAccessKey: 'storefront-test-only',
};

const ALREADY_OWNED = 'BucketAlreadyOwnedByYou';

export async function ensureBucket(options: S3StoreOptions): Promise<void> {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });
  try {
    await client.send(new CreateBucketCommand({ Bucket: options.bucket }));
  } catch (error) {
    if (!(error instanceof S3ServiceException && error.name === ALREADY_OWNED)) throw error;
  }
}
