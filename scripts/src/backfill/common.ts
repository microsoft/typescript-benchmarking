import assert from "node:assert";

import vsts from "azure-devops-node-api";

import { retry } from "../utils.js";

const unset = Symbol();

function memoize<T>(fn: () => T): () => T {
    let v: T | typeof unset = unset;
    return () => {
        if (v !== unset) {
            return v;
        }
        return (v = fn());
    };
}

const project = "cf7ac146-d525-443c-b23c-0d58337efebc";

const getBuildApi = memoize(() => {
    const vstsToken = process.env.VSTS_TOKEN;
    assert(vstsToken, "Must provide VSTS_TOKEN environment variable.");

    const vstsTypescript = new vsts.WebApi(
        "https://typescript.visualstudio.com/defaultcollection",
        vsts.getPersonalAccessTokenHandler(vstsToken),
    );
    return vstsTypescript.getBuildApi();
});

export async function getPendingBuildCount(pipeline: number) {
    const build = await getBuildApi();
    const builds = await retry(() =>
        build.getBuilds(
            project,
            [pipeline],
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            /** @type {any} */ (1 | 32), // BuildStatus.InProgress | BuildStatus.NotStarted
        )
    );
    return builds.length;
}

interface PipelineRunArgs {
    resources?: {
        repositories?: Record<string, { refName?: string; version?: string } | undefined>;
    };
    variables?: Record<string, { isSecret?: boolean; value?: string } | undefined>;
    templateParameters?: Record<string, string | number | boolean | undefined>;
}

interface PipelineRunResult {
    _links: { web: { href: string } };
}

export async function runPipeline(pipelineId: number, args: PipelineRunArgs): Promise<PipelineRunResult> {
    const build = await getBuildApi();

    return retry(async () => {
        // https://github.com/microsoft/azure-devops-go-api/blob/8dbf8bfd3346f337d914961fab01df812985dcb8/azuredevops/v7/pipelines/client.go#L446
        const verData = await build.vsoClient.getVersioningData(
            "7.1-preview.1",
            "pipelines",
            "7859261e-d2e9-4a68-b820-a5d84cc5bb3d",
            { project, pipelineId },
        );
        const url = verData.requestUrl;
        const options = build.createRequestOptions("application/json", verData.apiVersion);
        assert(url);

        const response = await build.rest.create(url, args, options);
        return response.result as PipelineRunResult;
    });
}
