import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

import { AzureStorageOptions } from "./options";

const defaultAzureStorageAccount = "tsperfstorage2";
const defaultBlobContainer = "benchmark";

export function getBlobService(options: AzureStorageOptions | undefined) {
    const azureStorageAccount = getAzureStorageAccount(options);
    const azureStorageUrl = `https://${azureStorageAccount}.blob.core.windows.net`;
    const credential = new DefaultAzureCredential();
    return new BlobServiceClient(azureStorageUrl, credential);
}

function getAzureStorageAccount(options: AzureStorageOptions | undefined) {
    return options && options.azureStorageAccount
        || process.env.TSPERF_AZURE_STORAGE_ACCOUNT
        || defaultAzureStorageAccount;
}

export function getBlobContainer(options: AzureStorageOptions | undefined) {
    return options && options.azureStorageContainer
        || process.env.TSPERF_AZURE_STORAGE_CONTAINER
        || defaultBlobContainer;
}
