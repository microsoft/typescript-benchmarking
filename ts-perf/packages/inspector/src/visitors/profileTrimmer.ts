import { Profiler } from "../profiler";
import { Visitor } from "../visitor";

export class ProfileTrimmer extends Visitor {
    private static readonly nativePattern = /^native /;
    private static readonly systemPattern = /^\([^)]+\)$/;
    private static readonly nodePattern = /^(internal[\\/]|[a-z0-9_]+(\.js)?$)/i;
    private static readonly mochaPattern = /[\\/]node_modules[\\/]mocha[\\/]/i;
    private static readonly externalPattern = /[\\/](node_modules|bower_components|jspm_packages)[\\/]/i;
    private static readonly packagePattern = /[\\/](node_modules|bower_components|jspm_packages)[\\/]([^\\/]+)[\\/]/i;
    private static readonly profilerPattern = /[\\/]@ts=perf[\\/]profiler[\\/]/i;
    private static readonly extraneousPackages: ReadonlySet<string> = new Set(["source-map-support"]);

    private _options: ProfileTrimmer.TrimOptions;

    private constructor(options: ProfileTrimmer.TrimOptions) {
        super();
        this._options = { ...options };
    }

    public static trimProfile(profile: Profiler.Profile, options: ProfileTrimmer.TrimOptions) {
        return new ProfileTrimmer(options).visitProfile(profile);
    }

    public visitProfile(profile: Profiler.Profile): Profiler.Profile {
        const lookup = profile.nodes.reduce(
            (map, node) => map.set(node.id, node),
            new Map<number, Profiler.ProfileNode>(),
        );
        const relocations = new Map<number, number>();
        const renumbers = new Map<number, number>();
        const nodes: Profiler.ProfileNode[] = [];
        this.walkProfileNode(profile.nodes[0], this._options, /*exclude*/ false, lookup, relocations, renumbers, nodes);
        const samples = profile.samples!.map(id => this.resolveRelocation(id, relocations, renumbers));
        return { ...profile, nodes, samples };
    }

    private walkProfileNode(
        node: Profiler.ProfileNode,
        options: ProfileTrimmer.TrimOptions,
        exclude: boolean,
        lookup: Map<number, Profiler.ProfileNode>,
        relocations: Map<number, number>,
        renumbers: Map<number, number>,
        outNodes: Profiler.ProfileNode[],
        outChildren?: number[],
    ) {
        let outNode: Profiler.ProfileNode | undefined;
        if (!exclude) {
            outNode = { ...node, id: outNodes.length + 1, children: node.children && [] };
            renumbers.set(node.id, outNode.id);
            outNodes.push(outNode);
            if (outChildren) outChildren.push(outNode.id);
            outChildren = outNode.children;
        }
        if (node.children) {
            for (const childId of node.children) {
                const child = lookup.get(childId)!;
                const exclude = this.shouldExclude(child, options);
                if (exclude) relocations.set(child.id, node.id);
                this.walkProfileNode(child, options, exclude, lookup, relocations, renumbers, outNodes, outChildren);
            }
        }
        if (outNode && outNode.children && outNode.children.length === 0) {
            outNode.children = undefined;
        }
    }

    private resolveRelocation(id: number, relocations: Map<number, number>, renumbers: Map<number, number>) {
        while (relocations.has(id)) id = relocations.get(id)!;
        return renumbers.get(id)!;
    }

    private shouldExclude(
        node: Profiler.ProfileNode,
        { trimNatives, trimNode, trimMocha, trimExternal, trimProfiler, trimExtraneous }: ProfileTrimmer.TrimOptions,
    ) {
        const callFrame = node.callFrame;
        const url = callFrame.url || "";
        return (!!trimNatives && ProfileTrimmer.nativePattern.test(url))
            || (!!trimNatives && url === "" && callFrame.scriptId === "0"
                && !ProfileTrimmer.systemPattern.test(callFrame.functionName))
            || (!!trimProfiler && ProfileTrimmer.profilerPattern.test(url))
            || (!!trimNode && ProfileTrimmer.nodePattern.test(url))
            || (!!trimExternal && ProfileTrimmer.externalPattern.test(url))
            || (!!trimMocha && ProfileTrimmer.mochaPattern.test(url))
            || (!!trimExtraneous && this.isExtraneous(url));
    }

    private isExtraneous(url: string) {
        const match = ProfileTrimmer.packagePattern.exec(url);
        return !!match && ProfileTrimmer.extraneousPackages.has(match[1].toLocaleLowerCase());
    }
}

export namespace ProfileTrimmer {
    export interface TrimOptions {
        trimNatives?: boolean;
        trimNode?: boolean;
        trimMocha?: boolean;
        trimExternal?: boolean;
        trimProfiler?: boolean;
        trimExtraneous?: boolean;
    }
}
