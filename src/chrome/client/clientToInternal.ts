import { Handles } from 'vscode-debugadapter';
import { CallFrame } from '../internal/stackTraces';
import { ILoadedSource } from '../internal/loadedSource';
import * as errors from '../../errors';
import { BehaviorRecipie, BreakpointRecipieInUnbindedSource, BreakpointRecipiesInUnbindedSource } from '../internal/breakpoints';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ISourceIdentifier, SourceIdentifiedByLoadedSource } from '../internal/sourceIdentifier';
import { parseResourceIdentifier } from '../internal/resourceIdentifier';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { ZeroBasedLocation, LocationInUnbindedSource } from '../internal/locationInResource';
import { LineColTransformer } from '../../transformers/lineNumberTransformer';

export class ClientToInternal {
    // V1 reseted the frames on an onPaused event. Figure out if that is the right thing to do
    // TODO: Move this variable to a CallFramesManager class
    private readonly _frameHandles = new Handles<CallFrame<ILoadedSource>>();

    public getCallFrameById(frameId: number): CallFrame<ILoadedSource> {
        // TODO DIEGO: Add better error checking
        return this._frameHandles.get(frameId);
    }

    public getSourceFromHandle(handle: number): ILoadedSource {
        const loadedSource = this._sourceHandles.get(handle);
        if (!loadedSource) {
            throw errors.sourceRequestIllegalHandle();
        }
        return loadedSource;
    }

    public toSource(clientSource: DebugProtocol.Source): ISourceIdentifier {
        if (clientSource.path && !clientSource.sourceReference) {
            // Request url has chars unescaped, but they will be escaped in scriptsByUrl
            const identifier = parseResourceIdentifier(clientSource.path);
            return this._sourcesLogic.createSourceIdentifier(identifier);
        } else if (!clientSource.path && clientSource.sourceReference) {
            const source = this.getSourceFromHandle(clientSource.sourceReference);
            return new SourceIdentifiedByLoadedSource(source);
        } else {
            throw new Error(`Expected the source to have either a path (${clientSource.path}) or a source reference (${clientSource.sourceReference}) but not both`);
        }
    }

    public toBreakpoints(args: DebugProtocol.SetBreakpointsArguments): BreakpointRecipiesInUnbindedSource {
        const source = this.toSource(args.source);
        const breakpoints = args.breakpoints.map(breakpoint => this.toBreakpoint(source, breakpoint));
        return new BreakpointRecipiesInUnbindedSource(source, breakpoints);
    }

    public toBreakpoint(source: ISourceIdentifier, clientBreakpoint: DebugProtocol.SourceBreakpoint): BreakpointRecipieInUnbindedSource {
        return new BreakpointRecipieInUnbindedSource(
            new LocationInUnbindedSource(source, this.toLocation(clientBreakpoint)),
            this.toBehaviorWhenExecuted(clientBreakpoint));
    }

    public toLocation(location: { line: number; column?: number; }): ZeroBasedLocation {
        const lineNumber = this._lineColTransformer.convertClientLineToDebugger(location.line);
        const columnNumber = this._lineColTransformer.convertClientLineToDebugger(location.column);
        return new ZeroBasedLocation(lineNumber, columnNumber);
    }

    public toBehaviorWhenExecuted(behavior: { condition?: string; hitCondition?: string; logMessage?: string; }): BehaviorRecipie {
        return new BehaviorRecipie(behavior.condition, behavior.hitCondition, behavior.logMessage);
    }

    constructor(
        private readonly _sourcesLogic: SourcesLogic,
        private readonly _sourceHandles: Handles<ILoadedSource>,
        private readonly _lineColTransformer: LineColTransformer) { }
}