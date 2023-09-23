import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CancelToken } from "@esfx/canceltoken";

export const enum LogLevel {
    Off,
    Error,
    Warning,
    Info,
    Verbose,
}

export const enum LogEventType {
    Message,
    Critical,
    Error,
    Warning,
    Info,
    Verbose,
}

export class Logger {
    public level: LogLevel;
    private out: NodeJS.WritableStream | undefined;
    private err: NodeJS.WritableStream | undefined;
    private wrap: Logger | undefined;
    private end: boolean | undefined;

    constructor(
        level: LogLevel,
        options: {
            out?: NodeJS.WritableStream;
            err?: NodeJS.WritableStream;
            end?: boolean;
            wrap?: Logger;
        } = {},
    ) {
        this.level = level;
        this.out = options.out;
        this.err = options.err;
        this.wrap = options.wrap;
        this.end = options.end;
    }

    get outputStream() {
        return this.out;
    }
    get errorStream() {
        return this.err || this.outputStream;
    }

    log(message?: any): void {
        if (this.wrap) {
            this.wrap.log(message);
        }

        this.writeEvent(LogEventType.Message, message);
    }

    info(message: any): void {
        if (this.wrap) {
            this.wrap.info(message);
        }

        this.tryWriteEvent(LogEventType.Info, message);
    }

    warn(message: any): void {
        if (this.wrap) {
            this.wrap.warn(message);
        }

        this.tryWriteEvent(LogEventType.Warning, message);
    }

    trace(message: any): void {
        if (this.wrap) {
            this.wrap.trace(message);
        }

        this.tryWriteEvent(LogEventType.Verbose, message);
    }

    error(message: any): void {
        if (this.wrap) {
            this.wrap.error(message);
        }

        this.tryWriteEvent(LogEventType.Error, message);
    }

    assert(test: any, message?: any): void {
        if (!test) {
            message = message ? "Assertion failed: " + message : "Assertion failed.";
            this.error(message);
            if (this.shouldWriteEvent(LogEventType.Error)) {
                // eslint-disable-next-line no-debugger
                debugger;
                throw new Error(message);
            }
        }
    }

    close(): void {
        if (this.end) {
            const out = this.out as fs.WriteStream;
            const end = this.err as fs.WriteStream;
            if (out && out.close) {
                out.close();
            }

            if (end && end.close && end !== out) {
                end.close();
            }
        }
    }

    isEnabled(type: LogEventType) {
        return this.shouldWriteEvent(type);
    }

    protected shouldWriteEvent(type: LogEventType) {
        return type <= LogEventType.Critical || type <= this.level + 1;
    }

    protected tryWriteEvent(type: LogEventType, message: any): void {
        if (this.shouldWriteEvent(type)) {
            this.writeEvent(type, message);
        }
    }

    protected writeEvent(type: LogEventType, message: any): void {
        if (type >= LogEventType.Critical && type <= LogEventType.Warning) {
            if (type >= LogEventType.Error && message instanceof Error && message.stack) {
                message = message.stack;
            }

            this.writeError(this.getCategory(type), message);
        }
        else {
            this.write(this.getCategory(type), message);
        }
    }

    protected write(category: string | undefined, message: any) {
        if (!this.out) throw new TypeError("Not implemented");
        this.out.write((category ? category + ": " : "") + (message ? String(message) : "") + os.EOL);
    }

    protected writeError(category: string | undefined, message: any) {
        if (!this.err) {
            this.write(category, message);
        }
        else {
            this.err.write((category ? category + ": " : "") + (message ? String(message) : "") + os.EOL);
        }
    }

    protected getCategory(type: LogEventType): string | undefined {
        return undefined;
    }
}

export class HostContext {
    public readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    get cancellationToken() {
        return CancelToken.none;
    }
    get outputStream() {
        return this.logger.outputStream;
    }
    get errorStream() {
        return this.logger.errorStream;
    }
    get hasClientPathMappings() {
        return false;
    }

    public log(message?: any) {
        this.logger.log(message);
    }

    public info(message: any) {
        this.logger.info(message);
    }

    public warn(message: any) {
        this.logger.warn(message);
    }

    public trace(message: any) {
        this.logger.trace(message);
    }

    public error(message: any) {
        this.logger.error(message);
    }

    public assert(test: any, message?: any) {
        this.logger.assert(test, message);
    }
}

export function getUsername() {
    return os.userInfo().username;
}

export function getTempFolder() {
    return os.tmpdir();
}

export interface TempDirectories {
    tempDirectory: string;
    packageDirectory: string;
    suiteTempDirectory: string;
    outDirectory: string;
    sourcerootDirectory: string;
    maprootDirectory: string;
}

const localVersion = require("../package").version;

export async function getTempDirectories(): Promise<TempDirectories> {
    const username = getUsername();
    const tempDirectory = getTempFolder();
    const packageDirectory = path.join(tempDirectory, username, "ts-perf", localVersion);
    const suiteTempDirectory = path.join(packageDirectory, "tmp");
    const outDirectory = path.join(suiteTempDirectory, "output");
    const sourcerootDirectory = path.join(suiteTempDirectory, "sourceroot");
    const maprootDirectory = path.join(suiteTempDirectory, "maproot");
    await fs.promises.mkdir(packageDirectory, { recursive: true });
    await fs.promises.mkdir(outDirectory, { recursive: true });
    await fs.promises.mkdir(sourcerootDirectory, { recursive: true });
    await fs.promises.mkdir(maprootDirectory, { recursive: true });
    return { tempDirectory, packageDirectory, suiteTempDirectory, outDirectory, sourcerootDirectory, maprootDirectory };
}

export interface CpuComponents {
    model?: string;
    speed?: number;
}

export class Cpu {
    constructor(
        public readonly model: string | undefined,
        public readonly speed: number | undefined,
    ) {
    }
    public static create(components: CpuComponents) {
        return components instanceof Cpu ? components : new Cpu(components.model, components.speed);
    }
    public getComponents(): CpuComponents {
        return { model: this.model, speed: this.speed };
    }
    public with(components: CpuComponents) {
        const { model = this.model } = components;
        const { speed = this.speed } = components;
        if (model === this.model && speed === this.speed) return this;
        return new Cpu(model, speed);
    }
    public toJSON(): any {
        return this.getComponents();
    }
}

export interface SystemInfoComponents {
    platform?: string;
    release?: string;
    arch?: string;
    totalmem?: number;
    freemem?: number;
    hostname?: string;
    username?: string;
    cpus?: readonly (Cpu | CpuComponents)[];
}

export class SystemInfo {
    constructor(
        public readonly platform: string | undefined,
        public readonly release: string | undefined,
        public readonly arch: string | undefined,
        public readonly totalmem: number | undefined,
        public readonly freemem: number | undefined,
        public readonly hostname: string | undefined,
        public readonly username: string | undefined,
        public readonly cpus: readonly Cpu[] | undefined,
    ) {
    }
    public static create(components: SystemInfoComponents) {
        return components instanceof SystemInfo ? components : new SystemInfo(
            components.platform,
            components.release,
            components.arch,
            components.totalmem,
            components.freemem,
            components.hostname,
            components.username,
            components.cpus && components.cpus.map(Cpu.create),
        );
    }
    public static getCurrent() {
        return new SystemInfo(
            os.platform(),
            os.release(),
            os.arch(),
            os.totalmem(),
            os.freemem(),
            os.hostname(),
            os.userInfo().username,
            os.cpus().map(Cpu.create),
        );
    }
    public getComponents(): SystemInfoComponents {
        return {
            platform: this.platform,
            release: this.release,
            arch: this.arch,
            totalmem: this.totalmem,
            freemem: this.freemem,
            hostname: this.hostname,
            username: this.username,
            cpus: this.cpus,
        };
    }
    public with(components: SystemInfoComponents) {
        const { platform = this.platform } = components;
        const { release = this.release } = components;
        const { arch = this.arch } = components;
        const { totalmem = this.totalmem } = components;
        const { freemem = this.freemem } = components;
        const { hostname = this.hostname } = components;
        const { username = this.username } = components;
        const { cpus = this.cpus } = components;
        if (
            platform === this.platform && release === this.release && arch === this.arch
            && totalmem === this.totalmem && freemem === this.freemem && hostname === this.hostname
            && username === this.username && cpus === this.cpus
        ) {
            return this;
        }
        return SystemInfo.create({ platform, release, arch, totalmem, freemem, hostname, username, cpus });
    }
    public toJSON(): any {
        return this.getComponents();
    }
}
