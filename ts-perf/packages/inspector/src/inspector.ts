import { MatchingKeys } from "@ts-perf/core";
import { StrictEventArgTypes } from "@ts-perf/events";

import * as inspector from "./inspector";

// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66681#issuecomment-1724642846
export * from "inspector";

declare module "inspector" {
    interface SessionEvents {
        "inspectorNotification": (message: inspector.InspectorNotification<{}>) => void;
        "Runtime.executionContextCreated": (
            message: inspector.InspectorNotification<Runtime.ExecutionContextCreatedEventDataType>,
        ) => void;
        "Runtime.executionContextDestroyed": (
            message: inspector.InspectorNotification<Runtime.ExecutionContextDestroyedEventDataType>,
        ) => void;
        "Runtime.executionContextsCleared": () => void;
        "Runtime.exceptionThrown": (
            message: inspector.InspectorNotification<Runtime.ExceptionThrownEventDataType>,
        ) => void;
        "Runtime.exceptionRevoked": (
            message: inspector.InspectorNotification<Runtime.ExceptionRevokedEventDataType>,
        ) => void;
        "Runtime.consoleAPICalled": (
            message: inspector.InspectorNotification<Runtime.ConsoleAPICalledEventDataType>,
        ) => void;
        "Runtime.inspectRequested": (
            message: inspector.InspectorNotification<Runtime.InspectRequestedEventDataType>,
        ) => void;
        "Runtime.bindingCalled": (
            message: inspector.InspectorNotification<
                { name: string; payload: string; executionContextId: Runtime.ExecutionContextId; }
            >,
        ) => void;
        "Debugger.scriptParsed": (message: inspector.InspectorNotification<Debugger.ScriptParsedEventDataType>) => void;
        "Debugger.scriptFailedToParse": (
            message: inspector.InspectorNotification<Debugger.ScriptFailedToParseEventDataType>,
        ) => void;
        "Debugger.breakpointResolved": (
            message: inspector.InspectorNotification<Debugger.BreakpointResolvedEventDataType>,
        ) => void;
        "Debugger.paused": (message: inspector.InspectorNotification<Debugger.PausedEventDataType>) => void;
        "Debugger.resumed": () => void;
        "Profiler.consoleProfileStarted": (
            message: inspector.InspectorNotification<Profiler.ConsoleProfileStartedEventDataType>,
        ) => void;
        "Profiler.consoleProfileFinished": (
            message: inspector.InspectorNotification<Profiler.ConsoleProfileFinishedEventDataType>,
        ) => void;
        "HeapProfiler.addHeapSnapshotChunk": (
            message: inspector.InspectorNotification<HeapProfiler.AddHeapSnapshotChunkEventDataType>,
        ) => void;
        "HeapProfiler.resetProfiles": () => void;
        "HeapProfiler.reportHeapSnapshotProgress": (
            message: inspector.InspectorNotification<HeapProfiler.ReportHeapSnapshotProgressEventDataType>,
        ) => void;
        "HeapProfiler.lastSeenObjectId": (
            message: inspector.InspectorNotification<HeapProfiler.LastSeenObjectIdEventDataType>,
        ) => void;
        "HeapProfiler.heapStatsUpdate": (
            message: inspector.InspectorNotification<HeapProfiler.HeapStatsUpdateEventDataType>,
        ) => void;
    }
    interface SessionActions {
        "Schema.getDomains": () => Schema.GetDomainsReturnType;
        "Runtime.evaluate": (params?: Runtime.EvaluateParameterType) => Runtime.EvaluateReturnType;
        "Runtime.awaitPromise": (params?: Runtime.AwaitPromiseParameterType) => Runtime.AwaitPromiseReturnType;
        "Runtime.callFunctionOn": (params?: Runtime.CallFunctionOnParameterType) => Runtime.CallFunctionOnReturnType;
        "Runtime.getProperties": (params?: Runtime.GetPropertiesParameterType) => Runtime.GetPropertiesReturnType;
        "Runtime.releaseObject": (params?: Runtime.ReleaseObjectParameterType) => void;
        "Runtime.releaseObjectGroup": (params?: Runtime.ReleaseObjectGroupParameterType) => void;
        "Runtime.runIfWaitingForDebugger": () => void;
        "Runtime.enable": () => void;
        "Runtime.disable": () => void;
        "Runtime.discardConsoleEntries": () => void;
        "Runtime.setCustomObjectFormatterEnabled": (
            params?: Runtime.SetCustomObjectFormatterEnabledParameterType,
        ) => void;
        "Runtime.compileScript": (params?: Runtime.CompileScriptParameterType) => Runtime.CompileScriptReturnType;
        "Runtime.runScript": (params?: Runtime.RunScriptParameterType) => Runtime.RunScriptReturnType;
        "Runtime.addBinding": (params?: Runtime.AddBindingsParameterType) => void;
        "Debugger.enable": () => void;
        "Debugger.disable": () => void;
        "Debugger.setBreakpointsActive": (params?: Debugger.SetBreakpointsActiveParameterType) => void;
        "Debugger.setSkipAllPauses": (params?: Debugger.SetSkipAllPausesParameterType) => void;
        "Debugger.setBreakpointByUrl": (
            params?: Debugger.SetBreakpointByUrlParameterType,
        ) => Debugger.SetBreakpointByUrlReturnType;
        "Debugger.setBreakpoint": (params?: Debugger.SetBreakpointParameterType) => Debugger.SetBreakpointReturnType;
        "Debugger.removeBreakpoint": (params?: Debugger.RemoveBreakpointParameterType) => void;
        "Debugger.getPossibleBreakpoints": (
            params?: Debugger.GetPossibleBreakpointsParameterType,
        ) => Debugger.GetPossibleBreakpointsReturnType;
        "Debugger.continueToLocation": (params?: Debugger.ContinueToLocationParameterType) => void;
        "Debugger.stepOver": () => void;
        "Debugger.stepInto": () => void;
        "Debugger.stepOut": () => void;
        "Debugger.pause": () => void;
        "Debugger.scheduleStepIntoAsync": () => void;
        "Debugger.resume": () => void;
        "Debugger.searchInContent": (
            params?: Debugger.SearchInContentParameterType,
        ) => Debugger.SearchInContentReturnType;
        "Debugger.setScriptSource": (
            params?: Debugger.SetScriptSourceParameterType,
        ) => Debugger.SetScriptSourceReturnType;
        "Debugger.restartFrame": (params?: Debugger.RestartFrameParameterType) => Debugger.RestartFrameReturnType;
        "Debugger.getScriptSource": (
            params?: Debugger.GetScriptSourceParameterType,
        ) => Debugger.GetScriptSourceReturnType;
        "Debugger.setPauseOnExceptions": (params?: Debugger.SetPauseOnExceptionsParameterType) => void;
        "Debugger.evaluateOnCallFrame": (
            params?: Debugger.EvaluateOnCallFrameParameterType,
        ) => Debugger.EvaluateOnCallFrameReturnType;
        "Debugger.setVariableValue": (params?: Debugger.SetVariableValueParameterType) => void;
        "Debugger.setAsyncCallStackDepth": (params?: Debugger.SetAsyncCallStackDepthParameterType) => void;
        "Debugger.setBlackboxPatterns": (params?: Debugger.SetBlackboxPatternsParameterType) => void;
        "Debugger.setBlackboxedRanges": (params?: Debugger.SetBlackboxedRangesParameterType) => void;
        "Profiler.enable": () => void;
        "Profiler.disable": () => void;
        "Profiler.setSamplingInterval": (params?: Profiler.SetSamplingIntervalParameterType) => void;
        "Profiler.start": () => void;
        "Profiler.stop": () => Profiler.StopReturnType;
        "Profiler.startPreciseCoverage": (params?: Profiler.StartPreciseCoverageParameterType) => void;
        "Profiler.stopPreciseCoverage": () => void;
        "Profiler.takePreciseCoverage": () => Profiler.TakePreciseCoverageReturnType;
        "Profiler.getBestEffortCoverage": () => Profiler.GetBestEffortCoverageReturnType;
        "HeapProfiler.enable": () => void;
        "HeapProfiler.disable": () => void;
        "HeapProfiler.startTrackingHeapObjects": (params?: HeapProfiler.StartTrackingHeapObjectsParameterType) => void;
        "HeapProfiler.stopTrackingHeapObjects": (params?: HeapProfiler.StopTrackingHeapObjectsParameterType) => void;
        "HeapProfiler.takeHeapSnapshot": (params?: HeapProfiler.TakeHeapSnapshotParameterType) => void;
        "HeapProfiler.collectGarbage": () => void;
        "HeapProfiler.getObjectByHeapObjectId": (
            params?: HeapProfiler.GetObjectByHeapObjectIdParameterType,
        ) => HeapProfiler.GetObjectByHeapObjectIdReturnType;
        "HeapProfiler.addInspectedHeapObject": (params?: HeapProfiler.AddInspectedHeapObjectParameterType) => void;
        "HeapProfiler.getHeapObjectId": (
            params?: HeapProfiler.GetHeapObjectIdParameterType,
        ) => HeapProfiler.GetHeapObjectIdReturnType;
        "HeapProfiler.startSampling": (params?: HeapProfiler.StartSamplingParameterType) => void;
        "HeapProfiler.stopSampling": () => HeapProfiler.StopSamplingReturnType;
    }
    interface Session<TEvents extends {} = SessionEvents> {
        addListener<E extends keyof TEvents>(
            event: E,
            listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
        ): this;
        addListener(event: never, listener: (...args: any[]) => void): this;
        removeListener<E extends keyof TEvents>(
            event: E,
            listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
        ): this;
        removeListener(event: never, listener: (...args: any[]) => void): this;
        prependListener<E extends keyof TEvents>(
            event: E,
            listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
        ): this;
        prependListener(event: never, listener: (...args: any[]) => void): this;
        prependOnceListener<E extends keyof TEvents>(
            event: E,
            listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
        ): this;
        prependOnceListener(event: never, listener: (...args: any[]) => void): this;
        on<E extends keyof TEvents>(
            event: E,
            listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
        ): this;
        on(event: string | symbol, listener: (...args: any[]) => void): this;
        once<E extends keyof TEvents>(
            event: E,
            listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
        ): this;
        once(event: string | symbol, listener: (...args: any[]) => void): this;
        emit<E extends keyof TEvents>(event: E, ...args: StrictEventArgTypes<TEvents[E]>): boolean;
        emit(event: string | symbol, ...args: any[]): boolean;
        post<M extends keyof SessionActions>(
            method: M,
            param: StrictEventArgTypes<SessionActions[M]>[0],
            callback: (error: Error | null, value: ReturnType<SessionActions[M]>) => void,
        ): void;
        post<M extends MatchingKeys<SessionActions, () => void>>(
            method: M,
            callback: (error: Error | null, value: ReturnType<SessionActions[M]>) => void,
        ): void;
    }
    namespace Runtime {
        interface StackTrace {
            promiseCreationFrame?: CallFrame;
        }
        interface AddBindingsParameterType {
            name: string;
            executionContextId?: ExecutionContextId;
            executionContextName?: string;
        }
    }
}
