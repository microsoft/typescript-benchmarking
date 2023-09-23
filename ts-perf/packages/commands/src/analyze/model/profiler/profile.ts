import { fileURLToPath } from "node:url";

import { TimeSpan } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";
import * as inspector from "@ts-perf/inspector";
import { from, Lazy, Query } from "iterable-query";

import { Category } from "./category";
import { CpuProfileCategoryView } from "./categoryView";
import { CpuProfileEvents } from "./events";
import { CpuProfileEventView } from "./eventView";
import { CpuProfileFileView } from "./fileView";
import { CpuProfileFunctionView } from "./functionView";
import { CpuProfileNode } from "./node";
import { CpuProfileNodeHierarchy } from "./nodeHierarchy";

// const loadActivity = "Loading CpuProfile...";
// const buildActivityMessage = "Building nodes";
// const buildActivityStart = 10;
// const buildActivityEnd = 20;
// const buildActivityRelativePercent = (buildActivityEnd - buildActivityStart) / 100;
// const buildTreeActivityMessage = "Building node hierarchy";
// const buildTreeActivityStart = 20;
// const buildTreeActivityEnd = 50;
// const buildTreeActivityRelativePercent = (buildTreeActivityEnd - buildTreeActivityStart) / 100;
// const relocateActivityMessage = "Relocating natives";
// const relocateActivityStart = 50;
// const relocateActivityEnd = 60;
// const relocateActivityRelativePercent = (relocateActivityEnd - relocateActivityStart) / 100;
// const relocateSamplesActivityMessage = "Updating samples";
// const relocateSamplesActivityStart = 60;
// const relocateSamplesActivityEnd = 70;
// const relocateSamplesActivityRelativePercent = (relocateSamplesActivityEnd - relocateSamplesActivityStart) / 100;
// const adjustSamplesActivityMessage = "adjusting samples";
// const adjustSamplesActivityStart = 70;
// const adjustSamplesActivityEnd = 85;
// const calculateTotalsActivityMessage = "Calculating totals and generating views";
// const calculateTotalsActivityStart = 85;
// const calculateTotalsActivityPhase1End = 95;
// const calculateTotalsActivityPhase1RelativePercent = (calculateTotalsActivityPhase1End - calculateTotalsActivityStart) / 100;
// const calculateTotalsActivityPhase2End = 100;

export class CpuProfile {
    readonly timeline: inspector.ReadonlyTimeline;
    readonly hierarchy: CpuProfileNodeHierarchy;
    readonly events: CpuProfileEvents;
    readonly startTime: TimeSpan;
    readonly endTime: TimeSpan;
    readonly duration: TimeSpan;
    readonly totalCount: number;
    readonly averageSampleDuration: TimeSpan;
    readonly samples: readonly number[];
    readonly timestamps: readonly TimeSpan[];
    readonly head: CpuProfileNode;
    readonly nodes: readonly CpuProfileNode[];
    readonly functions: readonly CpuProfileFunctionView[];
    readonly files: readonly CpuProfileFileView[];
    readonly categories: readonly CpuProfileCategoryView[];

    private _nodeIdMap: ReadonlyMap<number, CpuProfileNode>;
    private _functionMap: ReadonlyMap<string, CpuProfileFunctionView>;
    private _fileMap: ReadonlyMap<string, CpuProfileFileView>;
    private _categoryMap: ReadonlyMap<Category, CpuProfileCategoryView>;
    private _lazyEventRanges = Lazy.from(getEventRanges, this);

    constructor(
        timeline: inspector.ReadonlyTimeline,
        { includeNatives = false, host }: { includeNatives?: boolean; host?: HostContext; } = {},
    ) {
        const json = from(timeline.cpuProfiles()).first();
        if (!json) throw new Error("No CpuProfile found");

        // const logger = host ? host.logger : new Logger(LogLevel.Off);
        // logger.progress(loadActivity, { percentComplete: 0 });

        const rawNodeIdMap = from(json.nodes).toMap(node => node.id);
        let startTime = TimeSpan.fromMicroseconds(json.startTime);
        let endTime = TimeSpan.fromMicroseconds(json.endTime);
        let duration = endTime.subtract(startTime);
        let samples: number[] | undefined = json.samples;
        let timestamps: TimeSpan[] | undefined;

        // clean up raw nodes
        if (json.nodes[0].hitCount === undefined) {
            if (!json.samples) throw new Error();
            for (const node of json.nodes) node.hitCount = 0;
            for (const sample of json.samples) rawNodeIdMap.get(sample)!.hitCount!++;
            // logger.progress(loadActivity, { percentComplete: 10 });
        }

        const totalCount = from(json.nodes).sum(node => node.hitCount!);
        let averageSampleDuration = duration.scale(1 / totalCount);

        // build nodes
        // logger.progress(loadActivity, { message: buildActivityMessage, percentComplete: buildActivityStart });
        const nodes: CpuProfileNode[] = [];
        const nodeIdMap = new Map<number, CpuProfileNode>();
        for (const rawNode of json.nodes) {
            const node = new CpuProfileNode(rawNode);
            node["_profile"] = this;
            nodes.push(node);
            nodeIdMap.set(rawNode.id, node);
            // logger.progress(loadActivity, { message: buildActivityMessage, percentComplete: buildActivityStart + (i * 100 / json.nodes.length) * buildActivityRelativePercent });
        }
        // logger.progress(loadActivity, { message: buildActivityMessage, percentComplete: buildActivityEnd });

        // build node hierarchy
        // logger.progress(loadActivity, { message: buildTreeActivityMessage, percentComplete: buildTreeActivityStart });
        for (const parent of nodes) {
            const rawParent = rawNodeIdMap.get(parent.id)!;
            if (rawParent.children) {
                for (const childId of rawParent.children!) {
                    const child = nodeIdMap.get(childId)!;
                    parent["_children"].push(child);
                    child["_parent"] = parent;
                }
            }
            // logger.progress(loadActivity, { message: buildTreeActivityMessage, percentComplete: buildTreeActivityStart + (i * 100 / nodes.length) * buildTreeActivityRelativePercent });
        }
        // logger.progress(loadActivity, { message: buildTreeActivityMessage, percentComplete: buildTreeActivityEnd });

        // relocate native nodes
        if (!includeNatives) {
            // logger.progress(loadActivity, { message: relocateActivityMessage, percentComplete: relocateActivityStart });
            const relocations = new Map<number, number>();
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                if (node.isNativeCode && node.parent) {
                    relocations.set(node.id, node.parent.id);
                    const index = node.parent.children.indexOf(node);
                    node.parent["_children"].splice(index, 1, ...node.children);
                    for (const child of node.children) child["_parent"] = node.parent;
                    node.parent["_selfCount"] += node.selfCount;
                    node["_parent"] = undefined;
                    nodeIdMap.delete(node.id);
                    nodes.splice(i, 1);
                }
                // logger.progress(loadActivity, { message: relocateActivityMessage, percentComplete: relocateActivityStart + ((nodes.length - i) * 100 / nodes.length) * relocateActivityRelativePercent });
            }
            // logger.progress(loadActivity, { message: relocateActivityMessage, percentComplete: relocateActivityEnd });

            // update samples
            if (samples) {
                // logger.progress(loadActivity, { message: relocateSamplesActivityMessage, percentComplete: relocateSamplesActivityStart });
                samples = samples.map((id, i) => {
                    let relocatedId: number | undefined;
                    while ((relocatedId = relocations.get(id)) !== undefined) {
                        id = relocatedId;
                    }
                    // logger.progress(loadActivity, { message: relocateSamplesActivityMessage, percentComplete: relocateSamplesActivityStart + (i * 100 / nodes.length) * relocateSamplesActivityRelativePercent });
                    return id;
                });
                // logger.progress(loadActivity, { message: relocateSamplesActivityMessage, percentComplete: relocateSamplesActivityEnd });
            }
        }

        // fix samples and timestamps
        if (samples) {
            // logger.progress(loadActivity, { message: adjustSamplesActivityMessage, percentComplete: adjustSamplesActivityStart, spin: true });
            if (json.timeDeltas && json.timeDeltas.length) {
                [samples, timestamps] = from(samples)
                    .zip(
                        from(json.timeDeltas)
                            .map(TimeSpan.fromMicroseconds)
                            .scan((time, delta) => time.add(delta), startTime),
                    )
                    .orderBy(([, time]) => time.totalMicroseconds)
                    .unzip();
                const firstTimestamp = timestamps[0];
                const lastTimestamp = timestamps[timestamps.length - 1];
                startTime = firstTimestamp;
                averageSampleDuration = lastTimestamp.subtract(firstTimestamp).scale(1 / timestamps.length);
                endTime = lastTimestamp.add(averageSampleDuration);
                timestamps.push(endTime);
                duration = endTime.subtract(startTime);
            }
            else {
                timestamps = Query
                    .generate(samples.length + 1, i => startTime.add(averageSampleDuration.scale(i)))
                    .toArray();
            }

            // TODO: fix missing samples?

            // add timestamps to nodes
            for (const [sample, timestamp] of from(samples).zip(timestamps)) {
                const node = nodeIdMap.get(sample)!;
                node["_timestamps"].push(timestamp);
            }
            // logger.progress(loadActivity, { message: adjustSamplesActivityMessage, percentComplete: adjustSamplesActivityEnd, spin: false });
        }

        // compute totals and build views
        // logger.progress(loadActivity, { message: calculateTotalsActivityMessage, percentComplete: calculateTotalsActivityStart });
        const functionNodes = new Map<string, CpuProfileNode[]>();
        const fileNodes = new Map<string, CpuProfileNode[]>();
        const categoryNodes = new Map<Category, CpuProfileNode[]>();
        for (const node of nodes) {
            if (node.parent) node.parent["_totalCount"] += node["_totalCount"];
            multiMapAdd(functionNodes, node.callUID, node);
            multiMapAdd(fileNodes, node.location.url, node);
            multiMapAdd(categoryNodes, node.category, node);
            let category = node.category.parent;
            while (category) {
                multiMapAdd(categoryNodes, category, node);
                category = category.parent;
            }
            // logger.progress(loadActivity, { message: calculateTotalsActivityMessage, percentComplete: calculateTotalsActivityStart + (i * 100 / nodes.length) * calculateTotalsActivityPhase1RelativePercent });
        }
        // logger.progress(loadActivity, { message: calculateTotalsActivityMessage, percentComplete: calculateTotalsActivityPhase1End, spin: true });

        const functions = from(functionNodes)
            .toArray(([callUID, nodes]) => new CpuProfileFunctionView(this, callUID, nodes));
        const files = from(fileNodes)
            .toArray(([url, nodes]) => new CpuProfileFileView(this, url, nodes));
        const categories = from(categoryNodes)
            .toArray(([category, nodes]) => new CpuProfileCategoryView(this, category, nodes));

        // logger.progress(loadActivity, { message: calculateTotalsActivityMessage, percentComplete: calculateTotalsActivityPhase2End, spin: false });

        this.timeline = timeline;
        this.startTime = startTime;
        this.endTime = endTime;
        this.duration = duration;
        this.totalCount = totalCount;
        this.averageSampleDuration = averageSampleDuration;
        this.samples = samples || [];
        this.timestamps = timestamps || [];
        this.head = nodes[0];
        this.nodes = nodes;
        this.functions = functions;
        this.files = files;
        this.categories = categories;
        this._nodeIdMap = nodeIdMap;
        this._functionMap = from(functions).toMap(view => view.callUID);
        this._fileMap = from(files).toMap(view => view.url);
        this._categoryMap = from(categories).toMap(view => view.category);
        this.hierarchy = new CpuProfileNodeHierarchy(this);
        this.events = new CpuProfileEvents(this);

        // logger.progress(loadActivity, { completed: true });
    }

    get eventRanges() {
        return this._lazyEventRanges.value;
    }

    hasNode(id: number) {
        return this._nodeIdMap.has(id);
    }

    getNode(id: number) {
        const node = this._nodeIdMap.get(id);
        if (!node) throw new Error("Node not found");
        return node;
    }

    hasFunctionView(node: CpuProfileNode): boolean;
    hasFunctionView(callUID: string): boolean;
    hasFunctionView(callUID: string | CpuProfileNode) {
        return this._functionMap.has(typeof callUID === "string" ? callUID : callUID.callUID);
    }

    getFunctionView(node: CpuProfileNode): CpuProfileFunctionView;
    getFunctionView(callUID: string): CpuProfileFunctionView;
    getFunctionView(callUID: string | CpuProfileNode) {
        const func = this._functionMap.get(typeof callUID === "string" ? callUID : callUID.callUID);
        if (!func) throw new Error("Function not found");
        return func;
    }

    hasFileView(node: CpuProfileNode): boolean;
    hasFileView(url: string): boolean;
    hasFileView(url: string | CpuProfileNode) {
        return this._fileMap.has(fileURLToPath(typeof url === "string" ? url : url.url));
    }

    getFileView(node: CpuProfileNode): CpuProfileFileView;
    getFileView(url: string): CpuProfileFileView;
    getFileView(url: string | CpuProfileNode) {
        const func = this._fileMap.get(fileURLToPath(typeof url === "string" ? url : url.url));
        if (!func) throw new Error("File not found");
        return func;
    }

    hasCategoryView(node: CpuProfileNode): boolean;
    hasCategoryView(category: string | Category): boolean;
    hasCategoryView(category: string | Category | CpuProfileNode) {
        if (category instanceof CpuProfileNode) category = category.category;
        if (typeof category === "string") category = Category.get(category);
        return this._categoryMap.has(category);
    }

    getCategoryView(node: CpuProfileNode): CpuProfileCategoryView;
    getCategoryView(category: string | Category): CpuProfileCategoryView;
    getCategoryView(category: string | Category | CpuProfileNode) {
        if (category instanceof CpuProfileNode) category = category.category;
        if (typeof category === "string") category = Category.get(category);
        const func = this._categoryMap.get(category);
        if (!func) throw new Error("Category not found");
        return func;
    }
}

function multiMapAdd<K, V>(map: Map<K, V[]>, key: K, value: V) {
    const values = map.get(key);
    if (values) {
        values.push(value);
    }
    else {
        map.set(key, [value]);
    }
}

function getEventRanges(profile: CpuProfile): readonly CpuProfileEventView[] {
    const parseRanges = profile.events.getRanges("beforeProgram", "afterProgram");
    const bindRanges = profile.events.getRanges("beforeBind", "afterBind");
    const checkRanges = profile.events.getRanges("beforeCheck", "afterCheck");
    const emitRanges = profile.events.getRanges("beforeEmit", "afterEmit");
    let parseNodes: CpuProfileNode[] | undefined;
    let bindNodes: CpuProfileNode[] | undefined;
    let checkNodes: CpuProfileNode[] | undefined;
    let emitNodes: CpuProfileNode[] | undefined;
    let otherNodes: CpuProfileNode[] | undefined;
    for (const node of profile.nodes) {
        if (node.occursWithin(parseRanges)) {
            if (!parseNodes) parseNodes = [node];
            else parseNodes.push(node);
        }
        else if (node.occursWithin(bindRanges)) {
            if (!bindNodes) bindNodes = [node];
            else bindNodes.push(node);
        }
        else if (node.occursWithin(checkRanges)) {
            if (!checkNodes) checkNodes = [node];
            else checkNodes.push(node);
        }
        else if (node.occursWithin(emitRanges)) {
            if (!emitNodes) emitNodes = [node];
            else emitNodes.push(node);
        }
        else {
            if (!otherNodes) otherNodes = [node];
            else otherNodes.push(node);
        }
    }

    let views: CpuProfileEventView[] | undefined;
    if (parseNodes) addView(new CpuProfileEventView(profile, "Parse", "beforeProgram", "afterProgram", parseNodes));
    if (bindNodes) addView(new CpuProfileEventView(profile, "Bind", "beforeBind", "afterBind", bindNodes));
    if (checkNodes) addView(new CpuProfileEventView(profile, "Check", "beforeCheck", "afterCheck", checkNodes));
    if (emitNodes) addView(new CpuProfileEventView(profile, "Emit", "beforeEmit", "afterEmit", emitNodes));
    if (otherNodes) addView(new CpuProfileEventView(profile, "Other", "", "", otherNodes));
    return views || [];

    function addView(view: CpuProfileEventView) {
        if (!views) views = [view];
        else views.push(view);
    }
}
