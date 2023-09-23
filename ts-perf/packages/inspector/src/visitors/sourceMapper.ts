import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { mapSourcePosition, Position } from "source-map-support";

import { HeapProfiler } from "../heapProfiler";
import { PositionTickInfo, Profiler } from "../profiler";
import { Runtime } from "../runtime";
import { Visitor } from "../visitor";

export class SourceMapper extends Visitor {
    private static _privateInstance: SourceMapper | undefined;
    private _currentSourceRoot: string | undefined;

    private constructor() {
        super();
    }

    public static mapProfile(profile: Profiler.Profile, sourceRoot?: string): Profiler.Profile {
        return this.execShared(mapper => mapper.visitProfile(profile), sourceRoot);
    }

    public static mapProfileNode(node: Profiler.ProfileNode): Profiler.ProfileNode {
        return this.execShared(mapper => mapper.visitProfileNode(node));
    }

    public static mapCallFrame(callFrame: Runtime.CallFrame): Runtime.CallFrame {
        return this.execShared(mapper => mapper.visitCallFrame(callFrame));
    }

    public static mapSamplingHeapProfile(profile: HeapProfiler.SamplingHeapProfile): HeapProfiler.SamplingHeapProfile {
        return this.execShared(mapper => mapper.visitSamplingHeapProfile(profile));
    }

    public static mapSamplingHeapProfileNode(
        node: HeapProfiler.SamplingHeapProfileNode,
    ): HeapProfiler.SamplingHeapProfileNode {
        return this.execShared(mapper => mapper.visitSamplingHeapProfileNode(node));
    }

    private static execShared<T>(action: (mapper: SourceMapper) => T, sourceRoot?: string): T {
        const mapper = this._privateInstance || (this._privateInstance = new SourceMapper());
        return mapper.exec(action, /*reset*/ true, sourceRoot);
    }

    protected visitProfileNode(node: Profiler.ProfileNode): Profiler.ProfileNode {
        const callFrame = this.visitCallFrame(node.callFrame);
        if (callFrame === node.callFrame) return node;
        if (!node.positionTicks || callFrame.lineNumber === node.callFrame.lineNumber) return { ...node, callFrame };
        const positionTicks: PositionTickInfo[] = [];
        for (const positionTick of node.positionTicks) {
            const position: Position = {
                source: callFrame.url,
                line: positionTick.line + 1,
                column: 0,
            };
            const visited = this.mapSourcePosition(position);
            if (visited === position) {
                positionTicks.push(positionTick);
            }
            else {
                positionTicks.push({ ...positionTick, line: visited.line - 1 });
            }
        }
        return { ...node, callFrame, positionTicks };
    }

    protected visitCallFrame(callFrame: Runtime.CallFrame): Runtime.CallFrame {
        if (callFrame.lineNumber < 0) return callFrame;
        const position: Position = {
            source: callFrame.url,
            line: callFrame.lineNumber + 1,
            column: callFrame.columnNumber,
        };
        const visited = this.mapSourcePosition(position);
        return visited === position
            ? callFrame
            : {
                ...callFrame,
                url: visited.source,
                lineNumber: visited.line - 1,
                columnNumber: visited.column,
                _url: callFrame.url,
                _lineNumber: callFrame.lineNumber,
                _columnNumber: callFrame.columnNumber,
            } as Runtime.CallFrame;
    }

    private mapSourcePosition(position: Position) {
        const visited = mapSourcePosition(position);
        if (visited && visited !== position) {
            visited.source = fileURLToPath(visited.source);
            if (this._currentSourceRoot) {
                visited.source = path.relative(this._currentSourceRoot, visited.source);
            }
            return visited;
        }
        return position;
    }

    private exec<T>(action: (mapper: SourceMapper) => T, reset?: boolean, sourceRoot?: string): T {
        const previousSourceRoot = this._currentSourceRoot;
        try {
            if (reset) {
                this._currentSourceRoot = undefined;
            }

            if (sourceRoot) {
                this._currentSourceRoot = sourceRoot;
            }

            return action(this);
        }
        finally {
            this._currentSourceRoot = previousSourceRoot;
        }
    }
}
