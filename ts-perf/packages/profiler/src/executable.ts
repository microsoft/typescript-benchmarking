const processExitSentinel = {};

export class Executable {
    public readonly args: readonly string[];

    constructor(args: readonly string[] = []) {
        this.args = args;
    }

    public exec() {
        return new Promise<number>(resolve => {
            const savedExit = process.exit;
            const savedArgs = process.argv;

            let exitCode = 0;
            process.exit = (code = 0) => {
                exitCode = code;
                throw processExitSentinel;
            };

            process.once("beforeExit", handleExit);
            process.argv = [process.argv[0], ...this.args, "--diagnostics"];

            try {
                // Exec the compiler
                require(this.args[0]);
            }
            catch (e) {
                if (e === processExitSentinel) {
                    handleExit();
                }
                else {
                    throw e;
                }
            }

            function handleExit() {
                process.exit = savedExit;
                process.argv = savedArgs;
                try {
                    resolve(exitCode);
                }
                catch (e) {
                    console.error(e);
                    process.exit(-1);
                }
            }
        });
    }
}
