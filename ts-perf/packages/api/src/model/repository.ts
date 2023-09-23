import { execSync, ExecSyncOptions } from "node:child_process";

export interface RepositoryComponents {
    type?: string;
    url?: string;
    branch?: string;
    commit?: string;
    date?: string;
    subject?: string;
}

export class Repository {
    constructor(
        public readonly type?: string,
        public readonly url?: string,
        public readonly branch?: string,
        public readonly commit?: string,
        public readonly date?: string,
        public readonly subject?: string,
    ) {
    }

    public static create(components: RepositoryComponents) {
        return components instanceof Repository ? components : new Repository(
            components.type,
            components.url,
            components.branch,
            components.commit,
            components.date,
            components.subject,
        );
    }

    public static tryDiscover(
        cwd: string,
        type?: string,
        url?: string,
        branch?: string,
        commit?: string,
        date?: string,
        subject?: string,
    ) {
        return new Repository(type, url, branch, commit, date, subject).tryDiscover(cwd);
    }

    public static discover(cwd: string) {
        return this.discoverGit(cwd);
    }

    public static discoverGit(cwd: string) {
        try {
            // Only map stdout; without a git repo, git is noisy on stderr.
            const opts: ExecSyncOptions = { cwd, stdio: ["ignore", "pipe", "ignore"] };
            const url = execSync("git remote get-url origin", opts).toString().trim();
            const branch = execSync("git rev-parse --abbrev-ref HEAD", opts).toString().trim();
            const commit = execSync("git rev-parse HEAD", opts).toString().trim();
            const date = execSync("git log -1 --format=%cI", opts).toString().trim();
            const subject = execSync("git log -1 --format=%s", opts).toString().trim();
            return new Repository("git", url, branch, commit, new Date(date).toISOString(), subject);
        }
        catch (e) {
            return undefined;
        }
    }

    public tryDiscover(cwd: string, overwrite?: boolean) {
        if (!this.type || !this.url || !this.branch || !this.commit || !this.date || !this.subject) {
            const discoveryResult = Repository.discover(cwd);
            if (discoveryResult) {
                return overwrite
                    ? this.with(discoveryResult)
                    : this.with(discoveryResult).with(this);
            }
        }

        return this;
    }

    public getComponents(): RepositoryComponents {
        return {
            type: this.type,
            url: this.url,
            branch: this.branch,
            commit: this.commit,
            date: this.date,
            subject: this.subject,
        };
    }

    public with(components: Partial<RepositoryComponents>) {
        const { type = this.type } = components;
        const { url = this.url } = components;
        const { branch = this.branch } = components;
        const { commit = this.commit } = components;
        const { date = this.date } = components;
        const { subject = this.subject } = components;
        if (
            type === this.type
            && url === this.url
            && branch === this.branch
            && commit === this.commit
            && date === this.date
            && subject === this.subject
        ) {
            return this;
        }
        return Repository.create({ type, url, branch, commit, date, subject });
    }

    public toJSON(): any {
        return this.getComponents();
    }
}
