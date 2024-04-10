import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, RestError } from "@azure/storage-blob";

try {
    const credential = new DefaultAzureCredential();
    const storageClient = new BlobServiceClient("https://tsperfstorage2.blob.core.windows.net", credential);

    const blob = await storageClient
        .getContainerClient("benchmark")
        .getBlobClient("main/latest.linux.benchmark")
        .downloadToBuffer();

    console.log(blob.toString("utf-8"));
}
catch (e) {
    if (e instanceof RestError) {
        console.error(e.name, e.statusCode, e.details);
    }
    process.exit(1);
}
