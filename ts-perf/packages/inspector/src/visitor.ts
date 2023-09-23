import { Debugger } from "./debugger";
import { HeapProfiler } from "./heapProfiler";
import { Profiler } from "./profiler";
import { Runtime } from "./runtime";
import { Schema } from "./schema";
import { Timeline } from "./timeline";

export class Visitor {
    static visitArray<T>(array: T[], visitor: (value: T) => T | undefined): T[];
    static visitArray<T>(array: T[] | undefined, visitor: (value: T) => T | undefined): T[] | undefined;
    static visitArray<T>(array: readonly T[], visitor: (value: T) => T | undefined): readonly T[];
    static visitArray<T>(
        array: readonly T[] | undefined,
        visitor: (value: T) => T | undefined,
    ): readonly T[] | undefined;
    static visitArray<T>(
        array: readonly T[] | undefined,
        visitor: (value: T) => T | undefined,
    ): T[] | readonly T[] | undefined {
        if (!array) return undefined;
        let newArray: T[] | undefined;
        const numElements = array.length;
        for (let i = 0; i < numElements; i++) {
            const element = array[i];
            const visited = visitor(element);
            if (newArray || visited !== element || visited === undefined) {
                if (newArray === undefined) {
                    newArray = array.slice(0, i);
                }
                if (visited !== undefined) {
                    newArray.push(visited);
                }
            }
        }
        return newArray || array;
    }

    // #region Timeline
    protected visitTrace(trace: Timeline.Trace): Timeline.Trace {
        return this.updateTrace(
            trace,
            this.visitTraceEvents(trace.traceEvents),
        );
    }

    private updateTrace(trace: Timeline.Trace, traceEvents: Timeline.Event[]): Timeline.Trace {
        return trace.traceEvents !== traceEvents ? { ...trace, traceEvents } : trace;
    }

    protected visitTraceEvents(events: Timeline.Event[]): Timeline.Event[] {
        return Visitor.visitArray(events, event => this.visitTraceEvent(event));
    }

    protected visitTraceEvent(event: Timeline.Event): Timeline.Event {
        if (isCpuProfileEvent(event)) {
            const cpuProfile = this.visitProfile(event.args.data.cpuProfile);
            if (cpuProfile !== event.args.data.cpuProfile) {
                return { ...event, args: { data: { cpuProfile } } };
            }
        }
        return event;
    }

    // #endregion

    // #region Runtime

    protected visitRemoteObject(remoteObject: Runtime.RemoteObject): Runtime.RemoteObject {
        return this.updateRemoteObject(
            remoteObject,
            remoteObject.preview && this.visitObjectPreview(remoteObject.preview),
            remoteObject.customPreview && this.visitCustomPreview(remoteObject.customPreview),
        );
    }

    private updateRemoteObject(
        remoteObject: Runtime.RemoteObject,
        preview: Runtime.ObjectPreview | undefined,
        customPreview: Runtime.CustomPreview | undefined,
    ): Runtime.RemoteObject {
        return remoteObject.preview !== preview
                || remoteObject.customPreview !== customPreview
            ? { ...remoteObject, preview, customPreview }
            : remoteObject;
    }

    protected visitObjectPreview(objectPreview: Runtime.ObjectPreview): Runtime.ObjectPreview {
        return this.updateObjectPreview(
            objectPreview,
            objectPreview.properties && this.visitPropertyPreviews(objectPreview.properties),
            objectPreview.entries && this.visitEntryPreviews(objectPreview.entries),
        );
    }

    private updateObjectPreview(
        objectPreview: Runtime.ObjectPreview,
        properties: Runtime.PropertyPreview[],
        entries: Runtime.EntryPreview[] | undefined,
    ): Runtime.ObjectPreview {
        return objectPreview.properties !== properties
                || objectPreview.entries !== entries
            ? { ...objectPreview, properties, entries }
            : objectPreview;
    }

    protected visitCustomPreview(customPreview: Runtime.CustomPreview): Runtime.CustomPreview {
        return customPreview;
    }

    protected visitPropertyPreviews(propertyPreviews: Runtime.PropertyPreview[]): Runtime.PropertyPreview[] {
        return Visitor.visitArray(propertyPreviews, propertyPreview => this.visitPropertyPreview(propertyPreview));
    }

    protected visitPropertyPreview(propertyPreview: Runtime.PropertyPreview): Runtime.PropertyPreview {
        return this.updatePropertyPreview(
            propertyPreview,
            propertyPreview.valuePreview && this.visitObjectPreview(propertyPreview.valuePreview),
        );
    }

    private updatePropertyPreview(
        propertyPreview: Runtime.PropertyPreview,
        valuePreview: Runtime.ObjectPreview | undefined,
    ): Runtime.PropertyPreview {
        return propertyPreview.valuePreview !== valuePreview
            ? { ...propertyPreview, valuePreview }
            : propertyPreview;
    }

    protected visitEntryPreviews(entryPreviews: Runtime.EntryPreview[]): Runtime.EntryPreview[] {
        return Visitor.visitArray(entryPreviews, entryPreview => this.visitEntryPreview(entryPreview));
    }

    protected visitEntryPreview(entryPreview: Runtime.EntryPreview): Runtime.EntryPreview {
        return this.updateEntryPreview(
            entryPreview,
            entryPreview.key && this.visitObjectPreview(entryPreview.key),
            entryPreview.value && this.visitObjectPreview(entryPreview.value),
        );
    }

    private updateEntryPreview(
        entryPreview: Runtime.EntryPreview,
        key: Runtime.ObjectPreview | undefined,
        value: Runtime.ObjectPreview,
    ): Runtime.EntryPreview {
        return entryPreview.key !== key
                || entryPreview.value !== value
            ? { ...entryPreview, key, value }
            : entryPreview;
    }

    protected visitPropertyDescriptors(
        propertyDescriptors: Runtime.PropertyDescriptor[],
    ): Runtime.PropertyDescriptor[] {
        return Visitor.visitArray(
            propertyDescriptors,
            propertyDescriptor => this.visitPropertyDescriptor(propertyDescriptor),
        );
    }

    protected visitPropertyDescriptor(propertyDescriptor: Runtime.PropertyDescriptor): Runtime.PropertyDescriptor {
        return this.updatePropertyDescriptor(
            propertyDescriptor,
            propertyDescriptor.value && this.visitRemoteObject(propertyDescriptor.value),
            propertyDescriptor.get && this.visitRemoteObject(propertyDescriptor.get),
            propertyDescriptor.set && this.visitRemoteObject(propertyDescriptor.set),
            propertyDescriptor.symbol && this.visitRemoteObject(propertyDescriptor.symbol),
        );
    }

    private updatePropertyDescriptor(
        propertyDescriptor: Runtime.PropertyDescriptor,
        value: Runtime.RemoteObject | undefined,
        get: Runtime.RemoteObject | undefined,
        set: Runtime.RemoteObject | undefined,
        symbol: Runtime.RemoteObject | undefined,
    ): Runtime.PropertyDescriptor {
        return propertyDescriptor.value !== value
                || propertyDescriptor.get !== get
                || propertyDescriptor.set !== set
                || propertyDescriptor.symbol !== symbol
            ? { ...propertyDescriptor, symbol, value, get, set }
            : propertyDescriptor;
    }

    protected visitInternalPropertyDescriptors(
        internalPropertyDescriptors: Runtime.InternalPropertyDescriptor[],
    ): Runtime.InternalPropertyDescriptor[] {
        return Visitor.visitArray(
            internalPropertyDescriptors,
            internalPropertyDescriptor => this.visitInternalPropertyDescriptor(internalPropertyDescriptor),
        );
    }

    protected visitInternalPropertyDescriptor(
        internalPropertyDescriptor: Runtime.InternalPropertyDescriptor,
    ): Runtime.InternalPropertyDescriptor {
        return this.updateInternalPropertyDescriptor(
            internalPropertyDescriptor,
            internalPropertyDescriptor.value && this.visitRemoteObject(internalPropertyDescriptor.value),
        );
    }

    private updateInternalPropertyDescriptor(
        internalPropertyDescriptor: Runtime.InternalPropertyDescriptor,
        value: Runtime.RemoteObject | undefined,
    ): Runtime.InternalPropertyDescriptor {
        return internalPropertyDescriptor.value !== value
            ? { ...internalPropertyDescriptor, value }
            : internalPropertyDescriptor;
    }

    protected visitCallArgument(callArgument: Runtime.CallArgument): Runtime.CallArgument {
        return callArgument;
    }

    protected visitExceptionDetails(exceptionDetails: Runtime.ExceptionDetails): Runtime.ExceptionDetails {
        return this.updateExceptionDetails(
            exceptionDetails,
            exceptionDetails.stackTrace && this.visitStackTrace(exceptionDetails.stackTrace),
            exceptionDetails.exception && this.visitRemoteObject(exceptionDetails.exception),
        );
    }

    private updateExceptionDetails(
        exceptionDetails: Runtime.ExceptionDetails,
        stackTrace: Runtime.StackTrace | undefined,
        exception: Runtime.RemoteObject | undefined,
    ): Runtime.ExceptionDetails {
        return exceptionDetails.stackTrace !== stackTrace
                || exceptionDetails.exception !== exception
            ? { ...exceptionDetails, stackTrace, exception }
            : exceptionDetails;
    }

    protected visitCallFrames(callFrames: Runtime.CallFrame[]): Runtime.CallFrame[] {
        return Visitor.visitArray(callFrames, callFrame => this.visitCallFrame(callFrame));
    }

    protected visitCallFrame(callFrame: Runtime.CallFrame): Runtime.CallFrame {
        return callFrame;
    }

    protected visitStackTrace(stackTrace: Runtime.StackTrace): Runtime.StackTrace {
        return this.updateStackTrace(
            stackTrace,
            stackTrace.callFrames && this.visitCallFrames(stackTrace.callFrames),
            stackTrace.parent && this.visitStackTrace(stackTrace.parent),
            stackTrace.promiseCreationFrame && this.visitCallFrame(stackTrace.promiseCreationFrame),
        );
    }

    private updateStackTrace(
        stackTrace: Runtime.StackTrace,
        callFrames: Runtime.CallFrame[],
        parent: Runtime.StackTrace | undefined,
        promiseCreationFrame: Runtime.CallFrame | undefined,
    ): Runtime.StackTrace {
        return stackTrace.callFrames !== callFrames
                || stackTrace.parent !== parent
                || stackTrace.promiseCreationFrame !== promiseCreationFrame
            ? { ...stackTrace, callFrames, parent, promiseCreationFrame }
            : stackTrace;
    }

    // TODO(rbuckton): Determine if there is any value here
    // protected visitRemoteResult(remoteResult: Runtime.RemoteResult): Runtime.RemoteResult {
    //     return this.updateRemoteResult(
    //         remoteResult,
    //         remoteResult.result && this.visitRemoteObject(remoteResult.result),
    //         remoteResult.exceptionDetails && this.visitExceptionDetails(remoteResult.exceptionDetails));
    // }

    // private updateRemoteResult(remoteResult: Runtime.RemoteResult, result: Runtime.RemoteObject, exceptionDetails: Runtime.ExceptionDetails | undefined): Runtime.RemoteResult {
    //     return remoteResult.result !== result ||
    //         remoteResult.exceptionDetails !== exceptionDetails
    //         ? { ...remoteResult, result, exceptionDetails }
    //         : remoteResult;
    // }

    // protected visitGetPropertiesReturnType(remoteResult: Runtime.GetPropertiesReturnType): Runtime.GetPropertiesReturnType {
    //     return this.updateGetPropertiesReturnType(
    //         remoteResult,
    //         remoteResult.result && this.visitPropertyDescriptors(remoteResult.result),
    //         remoteResult.internalProperties && this.visitInternalPropertyDescriptors(remoteResult.internalProperties),
    //         remoteResult.exceptionDetails && this.visitExceptionDetails(remoteResult.exceptionDetails));
    // }

    // private updateGetPropertiesReturnType(remoteResult: Runtime.GetPropertiesReturnType, result: Runtime.PropertyDescriptor[], internalProperties: Runtime.InternalPropertyDescriptor[] | undefined, exceptionDetails: Runtime.ExceptionDetails | undefined): Runtime.GetPropertiesReturnType {
    //     return remoteResult.result !== result ||
    //         remoteResult.internalProperties !== internalProperties ||
    //         remoteResult.exceptionDetails !== exceptionDetails
    //         ? { ...remoteResult, result, internalProperties, exceptionDetails }
    //         : remoteResult;
    // }

    // protected visitCompileScriptReturnType(remoteResult: Runtime.CompileScriptReturnType): Runtime.CompileScriptReturnType {
    //     return this.updateCompileScriptReturnType(
    //         remoteResult,
    //         remoteResult.exceptionDetails && this.visitExceptionDetails(remoteResult.exceptionDetails));
    // }

    // private updateCompileScriptReturnType(remoteResult: Runtime.CompileScriptReturnType, exceptionDetails: Runtime.ExceptionDetails | undefined): Runtime.CompileScriptReturnType {
    //     return remoteResult.exceptionDetails !== exceptionDetails
    //         ? { ...remoteResult, exceptionDetails }
    //         : remoteResult;
    // }

    // #endregion Runtime

    // #region Debugger

    protected visitLocations(locations: Debugger.Location[]): Debugger.Location[] {
        return Visitor.visitArray(locations, location => this.visitLocation(location));
    }

    protected visitLocation(location: Debugger.Location): Debugger.Location {
        return location;
    }

    protected visitScriptPosition(scriptPosition: Debugger.ScriptPosition): Debugger.ScriptPosition {
        return scriptPosition;
    }

    protected visitDebuggerCallFrames(callFrames: Debugger.CallFrame[]): Debugger.CallFrame[] {
        return Visitor.visitArray(callFrames, callFrame => this.visitDebuggerCallFrame(callFrame));
    }

    protected visitDebuggerCallFrame(callFrame: Debugger.CallFrame): Debugger.CallFrame {
        return this.updateDebuggerCallFrame(
            callFrame,
            callFrame.functionLocation && this.visitLocation(callFrame.functionLocation),
            callFrame.location && this.visitLocation(callFrame.location),
            callFrame.scopeChain && this.visitScopes(callFrame.scopeChain),
            callFrame.this && this.visitRemoteObject(callFrame.this),
            callFrame.returnValue && this.visitRemoteObject(callFrame.returnValue),
        );
    }

    private updateDebuggerCallFrame(
        callFrame: Debugger.CallFrame,
        functionLocation: Debugger.Location | undefined,
        location: Debugger.Location,
        scopeChain: Debugger.Scope[],
        thisArgument: Runtime.RemoteObject,
        returnValue: Runtime.RemoteObject | undefined,
    ): Debugger.CallFrame {
        return callFrame.functionLocation !== functionLocation
                || callFrame.location !== location
                || callFrame.scopeChain !== scopeChain
                || callFrame.this !== thisArgument
                || callFrame.returnValue !== returnValue
            ? { ...callFrame, functionLocation, location, scopeChain, this: thisArgument, returnValue }
            : callFrame;
    }

    protected visitScopes(scopes: Debugger.Scope[]): Debugger.Scope[] {
        return Visitor.visitArray(scopes, scope => this.visitScope(scope));
    }

    protected visitScope(scope: Debugger.Scope): Debugger.Scope {
        return this.updateScope(
            scope,
            scope.object && this.visitRemoteObject(scope.object),
            scope.startLocation && this.visitLocation(scope.startLocation),
            scope.endLocation && this.visitLocation(scope.endLocation),
        );
    }

    private updateScope(
        scope: Debugger.Scope,
        object: Runtime.RemoteObject,
        startLocation: Debugger.Location | undefined,
        endLocation: Debugger.Location | undefined,
    ): Debugger.Scope {
        return scope.object !== object
                || scope.startLocation !== startLocation
                || scope.endLocation !== endLocation
            ? { ...scope, object, startLocation, endLocation }
            : scope;
    }

    protected visitSearchMatches(searchMatches: Debugger.SearchMatch[]): Debugger.SearchMatch[] {
        return Visitor.visitArray(searchMatches, searchMatch => this.visitSearchMatch(searchMatch));
    }

    protected visitSearchMatch(searchMatch: Debugger.SearchMatch): Debugger.SearchMatch {
        return searchMatch;
    }

    protected visitBreakLocations(breakLocations: Debugger.BreakLocation[]): Debugger.BreakLocation[] {
        return Visitor.visitArray(breakLocations, breakLocation => this.visitBreakLocation(breakLocation));
    }

    protected visitBreakLocation(breakLocation: Debugger.BreakLocation): Debugger.BreakLocation {
        return breakLocation;
    }

    // TODO(rbuckton): Determine if there is any value in these.
    // protected visitSetBreakpointByUrlReturnType(remoteResult: Debugger.SetBreakpointByUrlReturnType): Debugger.SetBreakpointByUrlReturnType {
    //     return this.updateSetBreakpointByUrlReturnType(
    //         remoteResult,
    //         remoteResult.locations && this.visitLocations(remoteResult.locations));
    // }

    // private updateSetBreakpointByUrlReturnType(remoteResult: Debugger.SetBreakpointByUrlReturnType, locations: Debugger.Location[]): Debugger.SetBreakpointByUrlReturnType {
    //     return remoteResult.locations !== locations
    //         ? { ...remoteResult, locations }
    //         : remoteResult;
    // }

    // protected visitSetBreakpointReturnType(remoteResult: Debugger.SetBreakpointReturnType): Debugger.SetBreakpointReturnType {
    //     return this.updateSetBreakpointReturnType(
    //         remoteResult,
    //         remoteResult.actualLocation && this.visitLocation(remoteResult.actualLocation));
    // }

    // private updateSetBreakpointReturnType(remoteResult: Debugger.SetBreakpointReturnType, actualLocation: Debugger.Location): Debugger.SetBreakpointReturnType {
    //     return remoteResult.actualLocation !== actualLocation
    //         ? { ...remoteResult, actualLocation }
    //         : remoteResult;
    // }

    // protected visitSetScriptSourceReturnType(remoteResult: Debugger.SetScriptSourceReturnType): Debugger.SetScriptSourceReturnType {
    //     return this.updateSetScriptSourceReturnType(
    //         remoteResult,
    //         remoteResult.callFrames && this.visitDebuggerCallFrames(remoteResult.callFrames),
    //         remoteResult.asyncStackTrace && this.visitStackTrace(remoteResult.asyncStackTrace),
    //         remoteResult.exceptionDetails && this.visitExceptionDetails(remoteResult.exceptionDetails));
    // }

    // private updateSetScriptSourceReturnType(remoteResult: Debugger.SetScriptSourceReturnType, callFrames: Debugger.CallFrame[], asyncStackTrace: Runtime.StackTrace | undefined, exceptionDetails: Runtime.ExceptionDetails | undefined): Debugger.SetScriptSourceReturnType {
    //     return remoteResult.callFrames !== callFrames ||
    //         remoteResult.asyncStackTrace !== asyncStackTrace ||
    //         remoteResult.exceptionDetails !== exceptionDetails
    //         ? { ...remoteResult, callFrames, asyncStackTrace, exceptionDetails }
    //         : remoteResult;
    // }

    // protected visitRestartFrameReturnType(remoteResult: Debugger.RestartFrameReturnType): Debugger.RestartFrameReturnType {
    //     return this.updateRestartFrameReturnType(
    //         remoteResult,
    //         remoteResult.callFrames && this.visitDebuggerCallFrames(remoteResult.callFrames),
    //         remoteResult.asyncStackTrace && this.visitStackTrace(remoteResult.asyncStackTrace));
    // }

    // private updateRestartFrameReturnType(remoteResult: Debugger.RestartFrameReturnType, callFrames: Debugger.CallFrame[], asyncStackTrace: Runtime.StackTrace | undefined): Debugger.RestartFrameReturnType {
    //     return remoteResult.callFrames !== callFrames ||
    //         remoteResult.asyncStackTrace !== asyncStackTrace
    //         ? { ...remoteResult, callFrames, asyncStackTrace }
    //         : remoteResult;
    // }

    // #endregion

    // #region Profiler

    protected visitProfile(profile: Profiler.Profile): Profiler.Profile {
        return this.updateProfile(
            profile,
            profile.nodes && this.visitProfileNodes(profile.nodes),
        );
    }

    private updateProfile(profile: Profiler.Profile, nodes: Profiler.ProfileNode[]): Profiler.Profile {
        return profile.nodes !== nodes
            ? { ...profile, nodes }
            : profile;
    }

    protected visitProfileNodes(nodes: Profiler.ProfileNode[]): Profiler.ProfileNode[] {
        return Visitor.visitArray(nodes, node => this.visitProfileNode(node));
    }

    protected visitProfileNode(node: Profiler.ProfileNode): Profiler.ProfileNode {
        return this.updateProfileNode(
            node,
            node.callFrame && this.visitCallFrame(node.callFrame),
            node.positionTicks && this.visitPositionTickInfos(node.positionTicks),
        );
    }

    private updateProfileNode(
        node: Profiler.ProfileNode,
        callFrame: Runtime.CallFrame,
        positionTicks: Profiler.PositionTickInfo[] | undefined,
    ): Profiler.ProfileNode {
        return node.callFrame !== callFrame || node.positionTicks !== positionTicks
            ? { ...node, callFrame, positionTicks }
            : node;
    }

    protected visitPositionTickInfos(infos: Profiler.PositionTickInfo[]): Profiler.PositionTickInfo[] {
        return Visitor.visitArray(infos, info => this.visitPositionTickInfo(info));
    }

    protected visitPositionTickInfo(info: Profiler.PositionTickInfo): Profiler.PositionTickInfo {
        return info;
    }

    protected visitScriptCoverage(coverage: Profiler.ScriptCoverage): Profiler.ScriptCoverage {
        return this.updateScriptCoverage(
            coverage,
            coverage.functions && this.visitFunctionCoverages(coverage.functions),
        );
    }

    private updateScriptCoverage(
        coverage: Profiler.ScriptCoverage,
        functions: Profiler.FunctionCoverage[],
    ): Profiler.ScriptCoverage {
        return coverage.functions !== functions
            ? { ...coverage, functions }
            : coverage;
    }

    protected visitFunctionCoverages(coverages: Profiler.FunctionCoverage[]): Profiler.FunctionCoverage[] {
        return Visitor.visitArray(coverages, coverage => this.visitFunctionCoverage(coverage));
    }

    protected visitFunctionCoverage(coverage: Profiler.FunctionCoverage): Profiler.FunctionCoverage {
        return this.updateFunctionCoverage(
            coverage,
            coverage.ranges && this.visitCoverageRanges(coverage.ranges),
        );
    }

    private updateFunctionCoverage(
        coverage: Profiler.FunctionCoverage,
        ranges: Profiler.CoverageRange[],
    ): Profiler.FunctionCoverage {
        return coverage.ranges !== ranges
            ? { ...coverage, ranges }
            : coverage;
    }

    protected visitCoverageRanges(ranges: Profiler.CoverageRange[]): Profiler.CoverageRange[] {
        return Visitor.visitArray(ranges, range => this.visitCoverageRange(range));
    }

    protected visitCoverageRange(range: Profiler.CoverageRange): Profiler.CoverageRange {
        return range;
    }

    // #endregion Profiler

    // #region HeapProfiler

    protected visitSamplingHeapProfile(profile: HeapProfiler.SamplingHeapProfile): HeapProfiler.SamplingHeapProfile {
        return this.updateSamplingHeapProfile(
            profile,
            profile.head && this.visitSamplingHeapProfileNode(profile.head),
        );
    }

    protected visitSamplingHeapProfileNodes(
        nodes: HeapProfiler.SamplingHeapProfileNode[],
    ): HeapProfiler.SamplingHeapProfileNode[] {
        return Visitor.visitArray(nodes, node => this.visitSamplingHeapProfileNode(node));
    }

    protected visitSamplingHeapProfileNode(
        node: HeapProfiler.SamplingHeapProfileNode,
    ): HeapProfiler.SamplingHeapProfileNode {
        return this.updateSamplingHeapProfileNode(
            node,
            node.callFrame && this.visitCallFrame(node.callFrame),
            node.children && this.visitSamplingHeapProfileNodes(node.children),
        );
    }

    private updateSamplingHeapProfile(
        profile: HeapProfiler.SamplingHeapProfile,
        head: HeapProfiler.SamplingHeapProfileNode,
    ): HeapProfiler.SamplingHeapProfile {
        return profile.head !== head
            ? { ...profile, head }
            : profile;
    }

    private updateSamplingHeapProfileNode(
        node: HeapProfiler.SamplingHeapProfileNode,
        callFrame: Runtime.CallFrame,
        children: HeapProfiler.SamplingHeapProfileNode[],
    ): HeapProfiler.SamplingHeapProfileNode {
        return node.callFrame !== callFrame || node.children !== children
            ? { ...node, callFrame, children }
            : node;
    }

    // #endregion HeapProfiler

    // #region Schema

    protected visitDomain(domain: Schema.Domain): Schema.Domain {
        return domain;
    }

    // #endregion
}

function isCpuProfileEvent(event: Timeline.Event): event is Timeline.CpuProfileEvent {
    return event.ph === Timeline.Phase.instant
        && event.name === "CpuProfile"
        && !!event.args
        && !!((event.args as any).data)
        && !!((event.args as any).data.cpuProfile);
}
