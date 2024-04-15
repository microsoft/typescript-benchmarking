import assert from "node:assert";

import vsts from "azure-devops-node-api";
import type { RunPipelineParameters } from "azure-devops-node-api/interfaces/PipelinesInterfaces.js";

import { getNonEmptyEnv, retry } from "../utils.js";

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

const getWebApi = memoize(() => {
    const vstsToken = getNonEmptyEnv("VSTS_TOKEN");

    return new vsts.WebApi(
        "https://typescript.visualstudio.com/defaultcollection",
        vsts.getPersonalAccessTokenHandler(vstsToken),
    );
});

const getBuildApi = memoize(() => getWebApi().getBuildApi());
const getPipelinesApi = memoize(() => getWebApi().getPipelinesApi());

export async function getPendingBuildCount(pipeline: number) {
    const api = await getBuildApi();
    const builds = await retry(() =>
        api.getBuilds(
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

interface PipelineRunResult {
    _links?: { web: { href: string; }; };
}

export async function runPipeline(pipelineId: number, args: RunPipelineParameters): Promise<PipelineRunResult> {
    const api = await getPipelinesApi();
    return api.runPipeline(args, project, pipelineId);
}
