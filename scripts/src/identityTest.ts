import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

const credential = new DefaultAzureCredential();
const storageClient = new BlobServiceClient("https://tsperfstorage2.blob.core.windows.net", credential);

const blob = await storageClient
    .getContainerClient("benchmark")
    .getBlobClient("main/latest.benchmark")
    .downloadToBuffer();

console.log(blob.toString("utf-8"));
