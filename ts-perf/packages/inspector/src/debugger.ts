import { StrictEventEmitter } from "@ts-perf/events";

import * as inspector from "./inspector";
import { Runtime } from "./runtime";
import { Session } from "./session";

// See: https://chromedevtools.github.io/devtools-protocol/v8/Debugger/

export interface DebuggerEvents {
    /**
     * Fired when virtual machine parses script. This event is also fired for all known and uncollected scripts upon enabling debugger.
     */
    scriptParsed: (param: Debugger.ScriptInfo) => void;
    /**
     * Fired when virtual machine fails to parse the script.
     */
    scriptFailedToParse: (param: Debugger.ScriptInfo) => void;
    /**
     * Fired when breakpoint is resolved to an actual script and location.
     */
    breakpointResolved: (param: Debugger.BreakpointResolvedEventDataType) => void;
    /**
     * Fired when the virtual machine stopped on breakpoint or exception or any other stop criteria.
     */
    paused: (param: Debugger.PausedEventDataType) => void;
    /**
     * Fired when the virtual machine resumed execution.
     */
    resumed: () => void;
}

/**
 * Debugger domain exposes JavaScript debugging capabilities. It allows setting and removing breakpoints, stepping through execution, exploring stack traces, etc.
 */
export class Debugger extends StrictEventEmitter<DebuggerEvents> {
    public readonly session: Session;

    private _parsedScripts = new Map<Runtime.ScriptId, Debugger.ScriptInfo>();
    private _failedScripts = new Map<Runtime.ScriptId, Debugger.ScriptInfo>();

    constructor(session: Session) {
        super();
        this.session = session;
        this.session.on("Debugger.scriptParsed", message => {
            this._parsedScripts.set(message.params.scriptId, message.params);
            this.emit("scriptParsed", message.params);
        });
        this.session.on("Debugger.scriptFailedToParse", message => {
            this._failedScripts.set(message.params.scriptId, message.params);
            this.emit("scriptFailedToParse", message.params);
        });
        this.session.on("Debugger.breakpointResolved", message => this.emit("breakpointResolved", message.params));
        this.session.on("Debugger.paused", message => this.emit("paused", message.params));
        this.session.on("Debugger.resumed", () => this.emit("resumed"));
    }

    public getScriptUrl(scriptId: Runtime.ScriptId) {
        const script = this._parsedScripts.get(scriptId) || this._failedScripts.get(scriptId);
        return script && script.url;
    }

    public getScriptSourceMapUrl(scriptId: Runtime.ScriptId) {
        const script = this._parsedScripts.get(scriptId) || this._failedScripts.get(scriptId);
        return script && script.sourceMapURL;
    }

    public getScriptExecutionContextId(scriptId: Runtime.ScriptId) {
        const script = this._parsedScripts.get(scriptId) || this._failedScripts.get(scriptId);
        return script && script.executionContextId;
    }

    /**
     * Enables debugger for the given page. Clients should not assume that the debugging has been enabled until the result for this command is received.
     */
    public enable() {
        return this.session.postAsync("Debugger.enable");
    }

    /**
     * Disables debugger for given page.
     */
    public disable() {
        return this.session.postAsync("Debugger.disable");
    }

    /**
     * Activates / deactivates all breakpoints on the page.
     */
    public setBreakpointsActive(active: boolean) {
        return this.session.postAsync("Debugger.setBreakpointsActive", { active });
    }

    /**
     * Makes page not interrupt on any pauses (breakpoint, exception, dom exception etc).
     */
    public setSkipAllPauses(skip: boolean) {
        return this.session.postAsync("Debugger.setSkipAllPauses", { skip });
    }

    /**
     * Sets JavaScript breakpoint at given location specified by URL. Once this command is issued,
     * all existing parsed scripts will have breakpoints resolved and  returned in locations
     * property. Further matching script parsing will result in subsequent  breakpointResolved
     * events issued. This logical breakpoint will survive page reloads.
     */
    public setBreakpointByUrl(url: string, lineNumber: number, columnNumber?: number, condition?: string) {
        return this.session.postAsync("Debugger.setBreakpointByUrl", { lineNumber, url, columnNumber, condition });
    }

    /**
     * Sets JavaScript breakpoint at given location specified by URL regex. Once  this command is
     * issued, all existing parsed scripts will have breakpoints resolved and  returned in
     * locations property. Further matching script parsing will result in subsequent
     * breakpointResolved events issued. This logical breakpoint will survive page reloads.
     */
    public setBreakpointByUrlRegex(urlRegex: string, lineNumber: number, columnNumber?: number, condition?: string) {
        return this.session.postAsync("Debugger.setBreakpointByUrl", { lineNumber, urlRegex, columnNumber, condition });
    }

    /**
     * Sets JavaScript breakpoint at a given location.
     */
    public setBreakpoint(location: Debugger.Location, condition?: string) {
        return this.session.postAsync("Debugger.setBreakpoint", { location, condition });
    }

    /**
     * Removes JavaScript breakpoint.
     */
    public removeBreakpoint(breakpointId: Debugger.BreakpointId) {
        return this.session.postAsync("Debugger.removeBreakpoint", { breakpointId });
    }

    /**
     * Returns possible locations for breakpoint. scriptId in start and end range locations should be the same.
     * @experimental
     */
    public async getPossibleBreakpoints(
        start: Debugger.Location,
        end?: Debugger.Location,
        options: Debugger.GetPossibleBreakpointsOptions = {},
    ) {
        return (await this.session.postAsync("Debugger.getPossibleBreakpoints", { start, end, ...options })).locations;
    }

    /**
     * Continues execution until specific location is reached.
     */
    public continueToLocation(location: Debugger.Location, options: Debugger.ContinueToLocationOptions = {}) {
        return this.session.postAsync("Debugger.continueToLocation", { location, ...options });
    }

    /**
     * Steps over the statement.
     */
    public stepOver() {
        return this.session.postAsync("Debugger.stepOver");
    }

    /**
     * Steps into the function call.
     */
    public stepInto() {
        return this.session.postAsync("Debugger.stepInto");
    }

    /**
     * Steps out of the function call.
     */
    public stepOut() {
        return this.session.postAsync("Debugger.stepOut");
    }

    /**
     * Stops on the next JavaScript statement.
     */
    public pause() {
        return this.session.postAsync("Debugger.pause");
    }

    /**
     * Steps into next scheduled async task if any is scheduled before next pause. Returns success
     * when async task is actually scheduled, returns error if no task were scheduled or another
     * scheduleStepIntoAsync was called.
     * @experimental
     */
    public scheduleStepIntoAsync() {
        return this.session.postAsync("Debugger.scheduleStepIntoAsync");
    }

    /**
     * Resumes JavaScript execution.
     */
    public resume() {
        return this.session.postAsync("Debugger.resume");
    }

    /**
     * Searches for given string in script content.
     * @experimental
     */
    public async searchInContent(
        scriptId: Runtime.ScriptId,
        query: string,
        options: Debugger.SearchInContentOptions = {},
    ) {
        return (await this.session.postAsync("Debugger.searchInContent", { scriptId, query, ...options })).result;
    }

    /**
     * Edits JavaScript source live.
     */
    public setScriptSource(
        scriptId: Runtime.ScriptId,
        scriptSource: string,
        options: Debugger.SetScriptSourceOptions = {},
    ) {
        return this.session.postAsync("Debugger.setScriptSource", { scriptId, scriptSource, ...options });
    }

    /**
     * Restarts particular call frame from the beginning.
     */
    public restartFrame(callFrameId: Debugger.CallFrameId) {
        return this.session.postAsync("Debugger.restartFrame", { callFrameId });
    }

    /**
     * Returns source for the script with given id.
     */
    public async getScriptSource(scriptId: Runtime.ScriptId) {
        return (await this.session.postAsync("Debugger.getScriptSource", { scriptId })).scriptSource;
    }

    /**
     * Defines pause on exceptions state. Can be set to stop on all exceptions, uncaught exceptions
     * or no exceptions. Initial pause on exceptions state is `"none"`.
     */
    public setPauseOnExceptions(state: "none" | "uncaught" | "all") {
        return this.session.postAsync("Debugger.setPauseOnExceptions", { state });
    }

    /**
     * Evaluates expression on a given call frame.
     */
    public evaluateOnCallFrame(
        callFrameId: Debugger.CallFrameId,
        expression: string,
        options: Debugger.EvaluateOnCallFrameOptions = {},
    ) {
        return this.session.postAsync("Debugger.evaluateOnCallFrame", { callFrameId, expression, ...options });
    }

    /**
     * Changes value of variable in a callframe. Object-based scopes are not supported and must be mutated manually.
     */
    public setVariableValue(
        scopeNumber: number,
        variableName: string,
        newValue: Runtime.CallArgument,
        callFrameId: Debugger.CallFrameId,
    ) {
        return this.session.postAsync("Debugger.setVariableValue", {
            scopeNumber,
            variableName,
            newValue,
            callFrameId,
        });
    }

    /**
     * Enables or disables async call stacks tracking.
     */
    public setAsyncCallStackDepth(maxDepth: number) {
        return this.session.postAsync("Debugger.setAsyncCallStackDepth", { maxDepth });
    }

    /**
     * Replace previous blackbox patterns with passed ones. Forces backend to skip stepping/pausing
     * in scripts with url matching one of the patterns. VM will try to leave blackboxed script by
     * performing 'step in' several times, finally resorting to 'step out' if unsuccessful.
     * @experimental
     */
    public setBlackboxPatterns(patterns: string[]) {
        return this.session.postAsync("Debugger.setBlackboxPatterns", { patterns });
    }

    /**
     * Makes backend skip steps in the script in blackboxed ranges. VM will try leave blacklisted
     * scripts by performing 'step in' several times, finally resorting to 'step out' if
     * unsuccessful. Positions array contains positions where blackbox state is changed. First
     * interval isn't blackboxed. Array should be sorted.
     * @experimental
     */
    public setBlackboxedRanges(scriptId: Runtime.ScriptId, positions: Debugger.ScriptPosition[]) {
        return this.session.postAsync("Debugger.setBlackboxedRanges", { scriptId, positions });
    }
}

export namespace Debugger {
    export import BreakpointId = inspector.Debugger.BreakpointId;
    export import CallFrameId = inspector.Debugger.CallFrameId;
    export import Location = inspector.Debugger.Location;
    export import ScriptPosition = inspector.Debugger.ScriptPosition;
    export import CallFrame = inspector.Debugger.CallFrame;
    export import Scope = inspector.Debugger.Scope;
    export import SearchMatch = inspector.Debugger.SearchMatch;
    export import BreakLocation = inspector.Debugger.BreakLocation;
    export import SetBreakpointByUrlReturnType = inspector.Debugger.SetBreakpointByUrlReturnType;
    export import SetBreakpointReturnType = inspector.Debugger.SetBreakpointReturnType;
    export import GetPossibleBreakpointsReturnType = inspector.Debugger.GetPossibleBreakpointsReturnType;
    export import SearchInContentReturnType = inspector.Debugger.SearchInContentReturnType;
    export import SetScriptSourceReturnType = inspector.Debugger.SetScriptSourceReturnType;
    export import RestartFrameReturnType = inspector.Debugger.RestartFrameReturnType;
    export import GetScriptSourceReturnType = inspector.Debugger.GetScriptSourceReturnType;
    export import EvaluateOnCallFrameReturnType = inspector.Debugger.EvaluateOnCallFrameReturnType;
    export import ScriptParsedEventDataType = inspector.Debugger.ScriptParsedEventDataType;
    export import ScriptFailedToParseEventDataType = inspector.Debugger.ScriptFailedToParseEventDataType;
    export import BreakpointResolvedEventDataType = inspector.Debugger.BreakpointResolvedEventDataType;
    export import PausedEventDataType = inspector.Debugger.PausedEventDataType;

    export type GetPossibleBreakpointsOptions = Pick<
        inspector.Debugger.GetPossibleBreakpointsParameterType,
        "restrictToFunction"
    >;

    export type ContinueToLocationOptions = Pick<
        inspector.Debugger.ContinueToLocationParameterType,
        "targetCallFrames"
    >;

    export type SearchInContentOptions = Pick<
        inspector.Debugger.SearchInContentParameterType,
        | "caseSensitive"
        | "isRegex"
    >;

    export type SetScriptSourceOptions = Pick<inspector.Debugger.SetScriptSourceParameterType, "dryRun">;

    export type EvaluateOnCallFrameOptions = Pick<
        inspector.Debugger.EvaluateOnCallFrameParameterType,
        | "objectGroup"
        | "includeCommandLineAPI"
        | "silent"
        | "returnByValue"
        | "generatePreview"
        | "throwOnSideEffect"
    >;

    export type ScriptInfo =
        | ScriptParsedEventDataType
        | ScriptFailedToParseEventDataType;
}

export import BreakpointId = inspector.Debugger.BreakpointId;
export import CallFrameId = inspector.Debugger.CallFrameId;
export import Location = inspector.Debugger.Location;
export import ScriptPosition = inspector.Debugger.ScriptPosition;
export import CallFrame = inspector.Debugger.CallFrame;
export import Scope = inspector.Debugger.Scope;
export import SearchMatch = inspector.Debugger.SearchMatch;
export import BreakLocation = inspector.Debugger.BreakLocation;
