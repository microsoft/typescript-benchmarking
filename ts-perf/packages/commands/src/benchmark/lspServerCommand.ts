export function getLspServerCommand(
    lspServerPath: string,
    serverArgs: readonly string[],
    cpus: string | undefined,
    platform = process.platform,
) {
    if (!cpus) {
        return { command: lspServerPath, args: [...serverArgs] };
    }
    if (platform !== "linux") {
        throw new Error("--cpus only works on Linux");
    }
    return {
        command: "taskset",
        args: ["--cpu-list", cpus, lspServerPath, ...serverArgs],
    };
}
