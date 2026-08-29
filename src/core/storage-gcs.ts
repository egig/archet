import { Storage } from '@google-cloud/storage';
import { FileStorage } from '@flystorage/file-storage';
import { GoogleCloudStorageAdapter } from '@flystorage/google-cloud-storage';
import type { StorageConfig } from './config.js';

type GcsStorageConfig = Extract<StorageConfig, { driver: 'gcs' }>;

/** Peer dependency (`ratchet/storage/gcs`, not `ratchet/core`) so choosing a different driver
 * never forces installing `@google-cloud/storage`. */
export function createGcsStorage(config: GcsStorageConfig): FileStorage {
  const client = new Storage({
    projectId: config.projectId,
    keyFilename: config.keyFilename,
    credentials: config.credentials,
  });
  const bucket = client.bucket(config.bucket);
  return new FileStorage(new GoogleCloudStorageAdapter(bucket, { prefix: config.prefix }));
}
