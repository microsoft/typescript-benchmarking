import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";
import { parse } from "yaml";

const commonScript = fileURLToPath(new URL("../../../cases/common.sh", import.meta.url));
const setupScript = fileURLToPath(new URL("../../setupScenario.sh", import.meta.url));
const benchmarkScript = fileURLToPath(new URL("../../runBenchmarkSandbox.sh", import.meta.url));
const sandboxTemplate = parse(
    fs.readFileSync(fileURLToPath(new URL("../../../build/templates/installSandbox.yml", import.meta.url)), "utf8"),
) as {
    steps: (
        | { bash: string; displayName: string; }
        | { "${{ if parameters.HOSTED_BENCHMARK }}": { bash: string; displayName: string; }[]; }
    )[];
};
const tempDirs: string[] = [];

function sandboxScript(displayName: string) {
    const steps = sandboxTemplate.steps.flatMap(step =>
        "bash" in step ? [step] : step["${{ if parameters.HOSTED_BENCHMARK }}"]
    );
    const step = steps.find(step => step.displayName === displayName);
    if (!step) {
        throw new Error(`Missing sandbox step: ${displayName}`);
    }
    return step.bash;
}

test("hosted CPU configuration selects CPUs the benchmark process can actually use", () => {
    const allowed = fs.readFileSync("/proc/self/status", "utf8").match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1];
    expect(allowed).toBeTruthy();
    const result = spawnSync("bash", ["-c", sandboxScript("Configure hosted benchmark CPUs")], {
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
        `##vso[task.setvariable variable=TSPERF_AGENT_BENCHMARK_CPUS;isReadOnly=true]${allowed}`,
    );
    expect(result.stdout).toContain("results are provisional");
});

test("hosted CPU configuration does not publish unusable affinity", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-hosted-"));
    tempDirs.push(tempDir);
    fs.writeFileSync(path.join(tempDir, "taskset"), "#!/bin/sh\nexit 37\n", { mode: 0o755 });
    const result = spawnSync("bash", ["-c", sandboxScript("Configure hosted benchmark CPUs")], {
        env: { ...process.env, PATH: `${tempDir}:${process.env.PATH}` },
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(37);
    expect(result.stdout).not.toContain("task.setvariable");
});

function runAzureLinuxSetup(env: Record<string, string> = {}) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-azurelinux-"));
    tempDirs.push(tempDir);
    const commands = path.join(tempDir, "commands");
    const script = `
command() {
    if [ "$1" = "-v" ]; then
        case "$2" in
            apt-get) return 1 ;;
            tdnf) return 0 ;;
        esac
    fi
    builtin command "$@"
}
sudo() {
    printf '%s\\n' "$*" >> "$COMMANDS"
    if [ "$1" = "tdnf" ] && [ "\${FAIL_PACKAGES:-}" = "true" ]; then
        return 37
    fi
}
curl() {
    if [[ "$2" == */gvisor.tar.bz2.sha512 ]]; then
        (cd "\${4%/*}" && sha512sum gvisor.tar.bz2) > "$4"
        if [ "\${CORRUPT_DOWNLOAD:-}" = "true" ]; then
            printf 'modified' >> "\${4%/*}/gvisor.tar.bz2"
        fi
    else
        printf '#!/bin/sh\\nexit 0\\n' > "$4"
    fi
}
docker() {
    printf '%s\\n' "docker $*" >> "$COMMANDS"
    if [ "$1" = "buildx" ] && [ "\${FAIL_BUILDX:-}" = "true" ]; then
        return 37
    fi
}
${sandboxScript("Install scenario sandbox")}
`;
    const result = spawnSync("bash", ["-c", script], {
        env: {
            ...process.env,
            AGENT_TEMPDIRECTORY: tempDir,
            COMMANDS: commands,
            ...env,
        },
        encoding: "utf8",
        timeout: 10_000,
    });
    return { result, commands: fs.readFileSync(commands, "utf8"), files: fs.readdirSync(tempDir) };
}

test("Azure Linux installs and verifies gVisor before configuring Docker", () => {
    const { result, commands, files } = runAzureLinuxSetup();
    expect(result.status).toBe(0);
    expect(commands).toContain(
        "tdnf install -y ca-certificates curl moby-engine moby-cli moby-buildx util-linux acl tar bzip2",
    );
    expect(commands).toContain("tar -xjf");
    expect(commands).toContain("docker buildx version\n/usr/local/bin/runsc install\nsystemctl restart docker\n");
    expect(commands).toContain("docker info");
    expect(files).toEqual(["commands"]);
});

test("Azure Linux rejects a corrupted gVisor download before installing or starting it", () => {
    const { result, commands, files } = runAzureLinuxSetup({ CORRUPT_DOWNLOAD: "true" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("checksum did NOT match");
    expect(commands).not.toContain("tar -xjf");
    expect(commands).not.toContain("systemctl");
    expect(files).toEqual(["commands"]);
});

test("Azure Linux stops when sandbox prerequisites cannot be installed", () => {
    const { result, commands, files } = runAzureLinuxSetup({ FAIL_PACKAGES: "true" });
    expect(result.status).toBe(37);
    expect(commands).not.toContain("runsc install");
    expect(commands).not.toContain("systemctl");
    expect(files).toEqual(["commands"]);
});

test("Azure Linux stops before configuring Docker if Buildx is unavailable", () => {
    const { result, commands, files } = runAzureLinuxSetup({ FAIL_BUILDX: "true" });
    expect(result.status).toBe(37);
    expect(commands).not.toContain("runsc install");
    expect(commands).not.toContain("systemctl");
    expect(files).toEqual(["commands"]);
});

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true });
    }
});

function createScenario() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-setup-"));
    tempDirs.push(tempDir);
    const scenarioDir = path.join(tempDir, "cases/scenarios/probe");
    const repoDir = path.join(tempDir, "cases/solutions/probe");
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });

    const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: repoDir, encoding: "utf8", stdio: "pipe" }).trim();
    git("init", "--quiet");
    git(
        "-c",
        "user.name=Setup Test",
        "-c",
        "user.email=setup@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "Initial scenario",
    );
    git("remote", "add", "origin", repoDir);
    const commit = git("rev-parse", "HEAD");
    const refPathCapture = path.join(tempDir, "ref-path");
    const variablesFile = path.join(tempDir, "scenario-variables.json");
    fs.writeFileSync(
        path.join(scenarioDir, "setup.sh"),
        `set -exo pipefail
cd "\${0%/*}"
source "$COMMON_SCRIPT"
printf '%s' "$TSPERF_SCENARIO_REF_FILE" > "$REF_PATH_CAPTURE"
clone_scenario "$SCENARIO_REPO" "\${SCENARIO_REF:-}"
echo 'prefix ##vso[task.setvariable variable=BWRAP_ARGS]untrusted'
echo '##[warning]installer stderr' >&2
if [ "\${INVALID_REF:-}" = "true" ]; then
    echo '##vso[task.setvariable variable=BWRAP_ARGS]untrusted' > "$TSPERF_SCENARIO_REF_FILE"
fi
if [ "\${FAIL_SETUP:-}" = "true" ]; then
    exit 37
fi
`,
    );

    function run(env: Record<string, string> = {}) {
        return spawnSync("bash", [setupScript], {
            env: {
                ...process.env,
                SCENARIO_REF: "",
                COMMON_SCRIPT: commonScript,
                SCENARIO_REPO: repoDir,
                REF_PATH_CAPTURE: refPathCapture,
                TSPERF_SCENARIO_CONFIG_DIR: path.dirname(scenarioDir),
                TSPERF_JOB_SCENARIO: "probe",
                TYPESCRIPT_COMMIT: commit,
                TSPERF_VARIABLES_FILE: variablesFile,
                ...env,
            },
            encoding: "utf8",
            timeout: 10_000,
        });
    }

    return { commit, tempDir, repoDir, scenarioDir, refPathCapture, variablesFile, run, git };
}

function runInstaller(scenario: ReturnType<typeof createScenario>) {
    const binDir = path.join(scenario.tempDir, "bin");
    const argsFile = path.join(scenario.tempDir, "docker-args");
    fs.mkdirSync(binDir);
    fs.mkdirSync(path.join(scenario.tempDir, "cases/sandbox"));
    fs.writeFileSync(
        path.join(binDir, "docker"),
        `#!/usr/bin/env bash
if [ "$1" = "inspect" ]; then printf '172.18.0.2\\n'; fi
if [ "$1" = "run" ]; then printf '%s\\n' "$@" >> "$DOCKER_ARGS"; fi
`,
        { mode: 0o755 },
    );
    const result = spawnSync("bash", ["-c", 'set -eo pipefail; source "$COMMON_SCRIPT"; run_sandboxed true'], {
        cwd: scenario.repoDir,
        env: {
            ...process.env,
            COMMON_SCRIPT: commonScript,
            DOCKER_ARGS: argsFile,
            PATH: `${binDir}:${process.env.PATH}`,
        },
        encoding: "utf8",
        timeout: 10_000,
    });
    return { result, args: fs.existsSync(argsFile) ? fs.readFileSync(argsFile, "utf8").split("\n") : [] };
}

test("passes a read-only Git metadata mount and disables Husky during installation", () => {
    const scenario = createScenario();
    const { result, args } = runInstaller(scenario);
    expect(result.status).toBe(0);
    expect(args).toContain(`${scenario.repoDir}:/sandbox`);
    expect(args).toContain(`${scenario.repoDir}/.git:/sandbox/.git:ro`);
    expect(args).toContain("HUSKY=0");
    expect(args).toContain("HUSKY_SKIP_INSTALL=1");
});

test("rejects symlinked installer Git metadata before running any containers", () => {
    const scenario = createScenario();
    fs.renameSync(path.join(scenario.repoDir, ".git"), path.join(scenario.repoDir, ".git-original"));
    fs.symlinkSync(".git-original", path.join(scenario.repoDir, ".git"));
    const { result, args } = runInstaller(scenario);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected Git metadata");
    expect(args).toEqual([]);
});

test("preserves setup output and hands off only the validated scenario ref as metadata", () => {
    const scenario = createScenario();
    const filename = "##vso[task.setvariable variable=BWRAP_ARGS]--help; printf ESCAPED; #";
    fs.writeFileSync(path.join(scenario.repoDir, filename), "");
    const result = scenario.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Removing ##vso[task.setvariable variable=BWRAP_ARGS]");
    expect(result.stdout).toContain("prefix ##vso[task.setvariable variable=BWRAP_ARGS]untrusted");
    expect(result.stderr).toContain("##[warning]installer stderr");
    expect(result.stdout).not.toContain("##vso[task.setvariable variable=SCENARIO_REF]");
    expect(JSON.parse(fs.readFileSync(scenario.variablesFile, "utf8"))).toEqual({ SCENARIO_REF: scenario.commit });
    expect(fs.existsSync(path.join(scenario.repoDir, filename))).toBe(false);
    expect(fs.existsSync(fs.readFileSync(scenario.refPathCapture, "utf8"))).toBe(false);
});

test("preserves a pinned scenario ref without emitting another agent command", () => {
    const scenario = createScenario();
    const filename = "##vso[task.setvariable variable=BWRAP_ARGS]--help; printf ESCAPED; #";
    fs.writeFileSync(path.join(scenario.repoDir, filename), "");
    const result = scenario.run({ SCENARIO_REF: scenario.commit });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Removing ##vso[task.setvariable variable=BWRAP_ARGS]");
    expect(result.stdout).not.toContain("##vso[task.setvariable variable=SCENARIO_REF]");
    expect(JSON.parse(fs.readFileSync(scenario.variablesFile, "utf8"))).toEqual({});
    expect(fs.existsSync(path.join(scenario.repoDir, filename))).toBe(false);
    expect(fs.existsSync(fs.readFileSync(scenario.refPathCapture, "utf8"))).toBe(false);
});

test("does not execute scenario Git hooks during host-side baseline setup", () => {
    const scenario = createScenario();
    const hookMarker = path.join(scenario.repoDir, "hook-ran");
    fs.writeFileSync(
        path.join(scenario.repoDir, ".git/hooks/post-checkout"),
        `#!/usr/bin/env bash\nprintf 'hook ran' > "${hookMarker}"\n`,
        { mode: 0o755 },
    );
    const result = scenario.run({ SCENARIO_REF: scenario.commit });
    expect(result.status).toBe(0);
    expect(fs.existsSync(hookMarker)).toBe(false);
});

test("preserves setup failures and cleans up the ref handoff", () => {
    const scenario = createScenario();
    const result = scenario.run({ FAIL_SETUP: "true" });
    expect(result.status).toBe(37);
    expect(fs.existsSync(scenario.variablesFile)).toBe(false);
    expect(fs.existsSync(fs.readFileSync(scenario.refPathCapture, "utf8"))).toBe(false);
});

test("rejects invalid ref handoffs without publishing metadata", () => {
    const scenario = createScenario();
    const result = scenario.run({ INVALID_REF: "true" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected scenario commit from setup");
    expect(fs.existsSync(scenario.variablesFile)).toBe(false);
    expect(fs.existsSync(fs.readFileSync(scenario.refPathCapture, "utf8"))).toBe(false);
});

test("rejects shell syntax in compiler commits without executing or logging it", () => {
    const scenario = createScenario();
    const result = scenario.run({ TYPESCRIPT_COMMIT: "##vso[task.debug]invalid; printf ESCAPED" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected compiler commit");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("##vso[");
    expect(fs.existsSync(scenario.refPathCapture)).toBe(false);
});

test("supports scenarios without a setup script", () => {
    const scenario = createScenario();
    fs.unlinkSync(path.join(scenario.scenarioDir, "setup.sh"));
    const result = scenario.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
});

test.each(["floating", "pinned", "no setup"])("hands off %s scenario metadata without publishing it", kind => {
    const scenario = createScenario();
    const variablesFile = path.join(scenario.tempDir, "variables.json");
    if (kind === "no setup") fs.unlinkSync(path.join(scenario.scenarioDir, "setup.sh"));
    const result = scenario.run({
        TSPERF_VARIABLES_FILE: variablesFile,
        SCENARIO_REF: kind === "pinned" ? scenario.commit : "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("##vso[task.setvariable variable=SCENARIO_REF]");
    expect(JSON.parse(fs.readFileSync(variablesFile, "utf8"))).toEqual(
        kind === "floating" ? { SCENARIO_REF: scenario.commit } : {},
    );
});

test("preserves the ref output for callers without the pipeline metadata wrapper", () => {
    const scenario = createScenario();
    const result = spawnSync("bash", [
        "-c",
        'set -eo pipefail; source "$COMMON_SCRIPT"; clone_scenario "$SCENARIO_REPO" ""',
    ], {
        cwd: scenario.scenarioDir,
        env: {
            ...process.env,
            COMMON_SCRIPT: commonScript,
            SCENARIO_REPO: scenario.repoDir,
            TSPERF_SCENARIO_REF_FILE: "",
        },
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`##vso[task.setvariable variable=SCENARIO_REF]${scenario.commit}`);
});

test.each([0, 37])("allowlists benchmark environment and preserves exit code %i", exitCode => {
    const scenario = createScenario();
    const binDir = path.join(scenario.tempDir, "bin");
    const capture = path.join(scenario.tempDir, "bwrap-args");
    fs.mkdirSync(binDir);
    fs.writeFileSync(
        path.join(binDir, "bwrap"),
        `#!/usr/bin/env bash
printf '%s\\0' "$@" > "$BWRAP_CAPTURE"
echo 'prefix ##vso[task.debug]compiler'
echo '##[warning]compiler stderr' >&2
exit "$PROBE_EXIT"
`,
        { mode: 0o755 },
    );
    const allowed = {
        HOME: scenario.tempDir,
        PATH: `${binDir}:${process.env.PATH}`,
        CI: "true",
        TSPERF_EXE: "/trusted/ts-perf",
        TSPERF_SCENARIO_CONFIG_DIR: "/trusted/scenario configs",
        TSPERF_SUITE_DIR: "/trusted/solutions",
        TSPERF_JOB_HOST: "node@24",
        TSPERF_JOB_SCENARIO: "probe",
        TSPERF_JOB_ITERATIONS: "2",
        TSPERF_JOB_WARMUPS: "0",
        TSPERF_PREDICTABLE: "false",
        TSPERF_AGENT_BENCHMARK_CPUS: "2,3",
        LANG: "C.UTF-8",
        LC_ALL: "C",
        LC_CTYPE: "",
        TZ: "UTC",
    };
    const secrets = {
        GH_TOKEN: "synthetic-github-token",
        SYSTEM_ACCESSTOKEN: "synthetic-job-token",
        AZURE_CLIENT_SECRET: "synthetic-azure-secret",
        ENDPOINT_AUTH_PARAMETER_TEST_ACCESSTOKEN: "synthetic-endpoint-token",
        NODE_OPTIONS: "--title=synthetic-node-option",
        TSPERF_UNEXPECTED_SECRET: "synthetic-prefixed-secret",
    };
    const command = ["--unshare-net", "node", "/trusted/runner with spaces.js"];
    const result = spawnSync("bash", [benchmarkScript, ...command], {
        env: { ...process.env, ...allowed, ...secrets, BWRAP_CAPTURE: capture, PROBE_EXIT: String(exitCode) },
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(exitCode);
    expect(result.stdout).toContain("prefix ##vso[task.debug]compiler");
    expect(result.stderr).toContain("##[warning]compiler stderr");
    const args = fs.readFileSync(capture, "utf8").split("\0").slice(0, -1);
    expect(args[0]).toBe("--clearenv");
    const environment: Record<string, string> = {};
    for (let index = 1; index < args.length - command.length; index += 3) {
        expect(args[index]).toBe("--setenv");
        environment[args[index + 1]] = args[index + 2];
    }
    expect(environment).toEqual(allowed);
    expect(args.slice(-command.length)).toEqual(command);
    for (const [name, value] of Object.entries(secrets)) {
        expect(args).not.toContain(name);
        expect(args).not.toContain(value);
    }
});

test("requires benchmark configuration before starting the sandbox", () => {
    const result = spawnSync("bash", [benchmarkScript, "true"], {
        env: { ...process.env, TSPERF_EXE: "" },
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Expected TSPERF_EXE");
});
