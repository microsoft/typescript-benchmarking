import { StrictEventEmitter } from "@ts-perf/events";

import { Debugger } from "./debugger";
import * as inspector from "./inspector";
import { Session } from "./session";

export interface RuntimeEvents {
    /**
     * Issued when new execution context is created.
     */
    executionContextCreated: (params: Runtime.ExecutionContextCreatedEventDataType) => void;
    /**
     * Issued when execution context is destroyed.
     */
    executionContextDestroyed: (params: Runtime.ExecutionContextDestroyedEventDataType) => void;
    /**
     * Issued when all executionContexts were cleared in browser
     */
    executionContextsCleared: () => void;
    /**
     * Issued when exception was thrown and unhandled.
     */
    exceptionThrown: (param: Runtime.ExceptionThrownEventDataType) => void;
    /**
     * Issued when unhandled exception was revoked.
     */
    exceptionRevoked: (params: Runtime.ExceptionRevokedEventDataType) => void;
    /**
     * Issued when console API was called.
     */
    consoleAPICalled: (param: Runtime.ConsoleAPICalledEventDataType) => void;
    /**
     * Issued when object should be inspected (for example, as a result of inspect() command line API call).
     */
    inspectRequested: (param: Runtime.InspectRequestedEventDataType) => void;
    bindingCalled: (param: { name: string; payload: string; executionContextId: Runtime.ExecutionContextId; }) => void;
}

/**
 * Runtime domain exposes JavaScript runtime by means of remote evaluation and mirror objects.
 * Evaluation results are returned as mirror object that expose object type, string representation
 * and unique identifier that can be used for further object reference. Original objects are
 * maintained in memory unless they are either explicitly released or are released along with the
 * other objects in their object group.
 */
export class Runtime extends StrictEventEmitter<RuntimeEvents> {
    public readonly session: Session;

    constructor(session: Session) {
        super();
        this.session = session;
        this.session.on(
            "Runtime.executionContextCreated",
            message => this.emit("executionContextCreated", message.params),
        );
        this.session.on(
            "Runtime.executionContextDestroyed",
            message => this.emit("executionContextDestroyed", message.params),
        );
        this.session.on("Runtime.executionContextsCleared", () => this.emit("executionContextsCleared"));
        this.session.on("Runtime.exceptionThrown", message => this.emit("exceptionThrown", message.params));
        this.session.on("Runtime.exceptionRevoked", message => this.emit("exceptionRevoked", message.params));
        this.session.on("Runtime.consoleAPICalled", message => this.emit("consoleAPICalled", message.params));
        this.session.on("Runtime.inspectRequested", message => this.emit("inspectRequested", message.params));
        this.session.on("Runtime.bindingCalled", message => this.emit("bindingCalled", message.params));
    }

    /**
     * Evaluates expression on global object.
     */
    public evaluate(expression: string, options: Runtime.EvaluateOptions = {}) {
        return this.session.postAsync("Runtime.evaluate", { expression, ...options });
    }

    /**
     * Add handler to promise with given promise object id.
     */
    public awaitPromise(promiseObjectId: Runtime.RemoteObjectId, options: Runtime.AwaitPromiseOptions = {}) {
        return this.session.postAsync("Runtime.awaitPromise", { promiseObjectId, ...options });
    }

    /**
     * Calls function with given declaration on the given object. Object group of the result is
     * inherited from the target object.
     */
    public callFunctionOn(
        functionDeclaration: string,
        objectId?: Runtime.RemoteObjectId,
        argumentsList?: Runtime.CallArgument[],
    ) {
        return this.session.postAsync("Runtime.callFunctionOn", {
            functionDeclaration,
            objectId,
            arguments: argumentsList,
        });
    }

    /**
     * Returns properties of a given object. Object group of the result is inherited from the target object.
     */
    public getProperties(objectId: Runtime.RemoteObjectId, options: Runtime.GetPropertiesOptions = {}) {
        return this.session.postAsync("Runtime.getProperties", { objectId, ...options });
    }

    /**
     * Releases remote object with given id.
     */
    public releaseObject(objectId: Runtime.RemoteObjectId) {
        return this.session.postAsync("Runtime.releaseObject", { objectId });
    }

    /**
     * Releases all remote objects that belong to a given group.
     */
    public releaseObjectGroup(objectGroup: string) {
        return this.session.postAsync("Runtime.releaseObjectGroup", { objectGroup });
    }

    /**
     * Tells inspected instance to run if it was waiting for debugger to attach.
     */
    public runIfWaitingForDebugger() {
        return this.session.postAsync("Runtime.runIfWaitingForDebugger");
    }

    /**
     * Enables reporting of execution contexts creation by means of `executionContextCreated`
     * event. When the reporting gets enabled the event will be sent immediately for each existing
     * execution context.
     */
    public enable() {
        return this.session.postAsync("Runtime.enable");
    }

    /**
     * Disables reporting of execution contexts creation.
     */
    public disable() {
        return this.session.postAsync("Runtime.disable");
    }

    /**
     * Discards collected exceptions and console API calls.
     */
    public discardConsoleEntries() {
        return this.session.postAsync("Runtime.discardConsoleEntries");
    }

    /**
     * @experimental
     */
    public setCustomObjectFormatterEnabled(enabled: boolean) {
        return this.session.postAsync("Runtime.setCustomObjectFormatterEnabled", { enabled });
    }

    public addBinding(name: string, executionContextId?: Runtime.ExecutionContextId, executionContextName?: string) {
        return this.session.postAsync("Runtime.addBinding", { name, executionContextId, executionContextName });
    }

    /**
     * Compiles `expression`.
     */
    public compileScript(
        expression: string,
        sourceURL: string,
        persistScript: boolean,
        executionContextId?: Runtime.ExecutionContextId,
    ) {
        return this.session.postAsync("Runtime.compileScript", {
            expression,
            sourceURL,
            persistScript,
            executionContextId,
        });
    }

    /**
     * Runs script with given id in a given context.
     */
    public runScript(scriptId: Runtime.ScriptId, options: Runtime.RunScriptOptions = {}) {
        return this.session.postAsync("Runtime.runScript", { scriptId, ...options });
    }
}

export namespace Runtime {
    export import ScriptId = inspector.Runtime.ScriptId;
    export import RemoteObjectId = inspector.Runtime.RemoteObjectId;
    export import UnserializableValue = inspector.Runtime.UnserializableValue;
    export import RemoteObject = inspector.Runtime.RemoteObject;
    export import CustomPreview = inspector.Runtime.CustomPreview;
    export import ObjectPreview = inspector.Runtime.ObjectPreview;
    export import PropertyPreview = inspector.Runtime.PropertyPreview;
    export import EntryPreview = inspector.Runtime.EntryPreview;
    export import PropertyDescriptor = inspector.Runtime.PropertyDescriptor;
    export import InternalPropertyDescriptor = inspector.Runtime.InternalPropertyDescriptor;
    export import CallArgument = inspector.Runtime.CallArgument;
    export import ExecutionContextId = inspector.Runtime.ExecutionContextId;
    export import ExecutionContextDescription = inspector.Runtime.ExecutionContextDescription;
    export import ExceptionDetails = inspector.Runtime.ExceptionDetails;
    export import Timestamp = inspector.Runtime.Timestamp;
    export import CallFrame = inspector.Runtime.CallFrame;
    export import StackTrace = inspector.Runtime.StackTrace;
    export import EvaluateReturnType = inspector.Runtime.EvaluateReturnType;
    export import AwaitPromiseReturnType = inspector.Runtime.AwaitPromiseReturnType;
    export import CallFunctionOnReturnType = inspector.Runtime.CallFunctionOnReturnType;
    export import GetPropertiesReturnType = inspector.Runtime.GetPropertiesReturnType;
    export import CompileScriptReturnType = inspector.Runtime.CompileScriptReturnType;
    export import RunScriptReturnType = inspector.Runtime.RunScriptReturnType;
    export import ExecutionContextCreatedEventDataType = inspector.Runtime.ExecutionContextCreatedEventDataType;
    export import ExecutionContextDestroyedEventDataType = inspector.Runtime.ExecutionContextDestroyedEventDataType;
    export import ExceptionThrownEventDataType = inspector.Runtime.ExceptionThrownEventDataType;
    export import ExceptionRevokedEventDataType = inspector.Runtime.ExceptionRevokedEventDataType;
    export import ConsoleAPICalledEventDataType = inspector.Runtime.ConsoleAPICalledEventDataType;
    export import InspectRequestedEventDataType = inspector.Runtime.InspectRequestedEventDataType;

    export type EvaluateOptions = Pick<
        inspector.Runtime.EvaluateParameterType,
        | "objectGroup"
        | "includeCommandLineAPI"
        | "silent"
        | "contextId"
        | "returnByValue"
        | "generatePreview"
        | "userGesture"
        | "awaitPromise"
    >;

    export type AwaitPromiseOptions = Pick<
        inspector.Runtime.AwaitPromiseParameterType,
        | "returnByValue"
        | "generatePreview"
    >;

    export type GetPropertiesOptions = Pick<
        inspector.Runtime.GetPropertiesParameterType,
        | "ownProperties"
        | "accessorPropertiesOnly"
        | "generatePreview"
    >;

    export type RunScriptOptions = Pick<
        inspector.Runtime.RunScriptParameterType,
        | "executionContextId"
        | "objectGroup"
        | "silent"
        | "includeCommandLineAPI"
        | "returnByValue"
        | "generatePreview"
        | "awaitPromise"
    >;

    export type RemoteResult =
        | EvaluateReturnType
        | AwaitPromiseReturnType
        | CallFunctionOnReturnType
        | RunScriptReturnType
        | Debugger.EvaluateOnCallFrameReturnType;
}

export import ScriptId = inspector.Runtime.ScriptId;
export import RemoteObjectId = inspector.Runtime.RemoteObjectId;
export import UnserializableValue = inspector.Runtime.UnserializableValue;
export import RemoteObject = inspector.Runtime.RemoteObject;
export import CustomPreview = inspector.Runtime.CustomPreview;
export import ObjectPreview = inspector.Runtime.ObjectPreview;
export import PropertyPreview = inspector.Runtime.PropertyPreview;
export import EntryPreview = inspector.Runtime.EntryPreview;
export import PropertyDescriptor = inspector.Runtime.PropertyDescriptor;
export import InternalPropertyDescriptor = inspector.Runtime.InternalPropertyDescriptor;
export import CallArgument = inspector.Runtime.CallArgument;
export import ExecutionContextId = inspector.Runtime.ExecutionContextId;
export import ExecutionContextDescription = inspector.Runtime.ExecutionContextDescription;
export import ExceptionDetails = inspector.Runtime.ExceptionDetails;
export import Timestamp = inspector.Runtime.Timestamp;
export import CallFrame = inspector.Runtime.CallFrame;
export import StackTrace = inspector.Runtime.StackTrace;
