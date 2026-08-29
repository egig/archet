import { S3Client } from '@aws-sdk/client-s3';
import { FileStorage } from '@flystorage/file-storage';
import { AwsS3StorageAdapter } from '@flystorage/aws-s3';
import type { StorageConfig } from './config.js';

type S3StorageConfig = Extract<StorageConfig, { driver: 's3' }>;

/** `endpoint`/`forcePathStyle` cover every S3-compatible service (R2's S3 API, MinIO,
 * DigitalOcean Spaces, Backblaze B2, ...), not just AWS — one driver for all of them. Peer
 * dependency (`ratchet/storage/s3`, not `ratchet/core`) so choosing a different driver never
 * forces installing `@aws-sdk/client-s3`. */
export function createS3Storage(config: S3StorageConfig): FileStorage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
  });
  return new FileStorage(new AwsS3StorageAdapter(client, { bucket: config.bucket, prefix: config.prefix }));
}
