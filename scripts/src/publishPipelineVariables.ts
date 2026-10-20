import assert from "node:assert";
import fs from "node:fs/promises";
import { inspect } from "node:util";

import esMain from "es-main";
import minimist from "minimist";

import { defangLoggingCommands, setJobVariable, setOutputVariable } from "./utils.js";

export async function publishPipelineVariables(file: string, options: { job: boolean; output: boolean; }) {
    assert(options.job || options.output, "Expected a pipeline variable scope");
    assert((await fs.lstat(file)).isFile(), "Expected a regular pipeline variables file");
    const variables: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    assert(
        typeof variables === "object" && variables !== null && !Array.isArray(variables),
        "Expected a pipeline variables object",
    );
    const entries = Object.entries(variables);
    for (const [name, value] of entries) {
        assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name), "Unexpected pipeline variable name");
        assert(typeof value === "string", "Expected a string pipeline variable value");
        // Job variables are read-only once set, so a repeated setup step cannot republish
        // them. Azure exposes job variables to later steps as uppercase environment names.
        const existing = options.job ? process.env[name.toUpperCase()] : undefined;
        assert(existing === undefined || existing === value, `Pipeline variable ${name} is already set`);
    }
    for (const [name, value] of entries) {
        assert(typeof value === "string");
        if (options.output) setOutputVariable(name, value);
        if (options.job && process.env[name.toUpperCase()] === undefined) setJobVariable(name, value);
    }
}

async function main() {
    const args = minimist(process.argv.slice(2), { string: ["file"], boolean: ["job", "output"] });
    assert(typeof args.file === "string" && args.file, "Expected --file");
    await publishPipelineVariables(args.file, { job: args.job, output: args.output });
}

if (esMain(import.meta)) {
    await main().catch((error: unknown) => {
        console.error(defangLoggingCommands(inspect(error)));
        process.exitCode = 1;
    });
}
