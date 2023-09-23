import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

import { AzureStorageOptions } from "./options";

const defaultAzureStorageAccount = "tsperfstorage";
const defaultBlobContainer = "benchmark";

export function getBlobService(options: AzureStorageOptions | undefined) {
    const azureStorageConnectionString = getAzureStorageConnectionString(options);
    const azureStorageAccount = getAzureStorageAccount(options);
    const azureStorageUrl = `https://${azureStorageAccount}.blob.core.windows.net",`;
    const azureStorageAccessKey = getAzureStorageAccessKey(options);
    if (options && options.azureStorageConnectionString) {
        // first, prefer explicit connection string
        return BlobServiceClient.fromConnectionString(azureStorageConnectionString!);
    }
    else if (options && (options.azureStorageAccount || options.azureStorageAccessKey) && azureStorageAccessKey) {
        // second, prefer explicit storage account/access key
        const accessKey = new StorageSharedKeyCredential(azureStorageAccount, azureStorageAccessKey);
        return new BlobServiceClient(azureStorageUrl, accessKey);
    }
    else if (azureStorageConnectionString) {
        // third, prefer ambient connection string
        return BlobServiceClient.fromConnectionString(azureStorageConnectionString);
    }
    else if (azureStorageAccount && azureStorageAccessKey) {
        // fourth, prefer ambient account and access key
        const accessKey = new StorageSharedKeyCredential(azureStorageAccount, azureStorageAccessKey);
        return new BlobServiceClient(azureStorageUrl, accessKey);
    }
    else {
        // finally, try defaults
        return new BlobServiceClient(azureStorageUrl);
    }
}

function getAzureStorageConnectionString(options: AzureStorageOptions | undefined) {
    return options && options.azureStorageConnectionString
        || process.env.TSPERF_AZURE_STORAGE_CONNECTION_STRING;
}

function getAzureStorageAccount(options: AzureStorageOptions | undefined) {
    return options && options.azureStorageAccount
        || process.env.TSPERF_AZURE_STORAGE_ACCOUNT
        || defaultAzureStorageAccount;
}

function getAzureStorageAccessKey(options: AzureStorageOptions | undefined) {
    return options && options.azureStorageAccessKey
        || process.env.TSPERF_AZURE_STORAGE_ACCESS_KEY;
}

export function getBlobContainer(options: AzureStorageOptions | undefined) {
    return options && options.azureStorageContainer
        || process.env.TSPERF_AZURE_STORAGE_CONTAINER
        || defaultBlobContainer;
}
