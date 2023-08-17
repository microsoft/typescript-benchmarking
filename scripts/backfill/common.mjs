import assert from "assert";
import vsts from "azure-devops-node-api";

const unset = Symbol();

/**
 * @type {<T>(fn: () => T) => () => T}
 */
function memoize(fn) {
    /** @type {any} */
    let v = unset;
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

/**
 * @param {number} pipeline
 */
export async function getPendingBuildCount(pipeline) {
    const build = await getBuildApi();
    const builds = await build.getBuilds(
        project,
        [pipeline],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        /** @type {any} */ (1 | 32), // BuildStatus.InProgress | BuildStatus.NotStarted
    );
    return builds.length;
}

/**
 * @typedef {{
 *     resources?: {
 *         repositories?: Record<string, { refName?: string; version?: string } | undefined>;
 *     };
 *     variables?: Record<string, { isSecret?: boolean; value?: string; } | undefined>;
 *     templateParameters?: Record<string, string | number | boolean | undefined>;
 * }} PipelineRunArgs
 *
 * @typedef {{
 *     _links: { web: { href: string }; };
 * }} PipelineRunResult
 */

/**
 * @param {number} pipelineId
 * @param {PipelineRunArgs} args
 * @returns {Promise<PipelineRunResult>}
 */
export async function runPipeline(pipelineId, args) {
    const build = await getBuildApi();

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
    return response.result;
}
