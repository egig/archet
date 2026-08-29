import { ContainerClient } from '@azure/storage-blob';
import { FileStorage } from '@flystorage/file-storage';
import { AzureStorageBlobStorageAdapter } from '@flystorage/azure-storage-blob';
import type { StorageConfig } from './config.js';

type AzureStorageConfig = Extract<StorageConfig, { driver: 'azure' }>;

/** Peer dependency (`ratchet/storage/azure`, not `ratchet/core`) so choosing a different driver
 * never forces installing `@azure/storage-blob`. */
export function createAzureStorage(config: AzureStorageConfig): FileStorage {
  const container = new ContainerClient(config.connectionString, config.containerName);
  return new FileStorage(new AzureStorageBlobStorageAdapter(container, { prefix: config.prefix }));
}
