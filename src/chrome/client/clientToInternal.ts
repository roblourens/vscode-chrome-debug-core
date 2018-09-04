import { ILoadedSource } from '../internal/loadedSource';
import { BPRecipieInUnbindedSource } from '../internal/breakpoints/bpRecipie';
import { DebugProtocol } from 'vscode-debugprotocol';
import { IRequestedSourceIdentifier, SourceIdentifiedByLoadedSource } from '../internal/sourceIdentifier';
import { parseResourceIdentifier } from '../internal/resourceIdentifier';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { ZeroBasedLocation, LocationInUnbindedSource } from '../internal/locationInResource';
import { LineColTransformer } from '../../transformers/lineNumberTransformer';
import { BPRecipiesInUnbindedSource } from '../internal/breakpoints/bpRecipies';
import { IBPBehavior, AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpBehavior';
import { HandlesRegistry } from './handlesRegistry';
import { FramePresentationOrLabel } from '../internal/stackTraces/stackTracePresentation';
import { LineNumber, ColumnNumber } from '../internal/locations/subtypes';

export class ClientToInternal {
    // V1 reseted the frames on an onPaused event. Figure out if that is the right thing to do
    // TODO: Move this variable to a CallFramesManager class
    public getCallFrameById(frameId: number): FramePresentationOrLabel<ILoadedSource> {
        return this._handlesRegistry.frames.getObjectById(frameId);
    }

    public getSourceFromId(handle: number): ILoadedSource {
        return this._handlesRegistry.sources.getObjectById(handle);
    }

    public toSource(clientSource: DebugProtocol.Source): IRequestedSourceIdentifier {
        if (clientSource.path && !clientSource.sourceReference) {
            // Request url has chars unescaped, but they will be escaped in scriptsByUrl
            const identifier = parseResourceIdentifier(clientSource.path);
            return this._sourcesLogic.createSourceIdentifier(identifier);
        } else if (clientSource.sourceReference) {
            const source = this.getSourceFromId(clientSource.sourceReference);
            return new SourceIdentifiedByLoadedSource(source);
        } else {
            throw new Error(`Expected the source to have either a path (${clientSource.path}) or a source reference (${clientSource.sourceReference})`);
        }
    }

    public toBreakpoints(args: DebugProtocol.SetBreakpointsArguments): BPRecipiesInUnbindedSource {
        const source = this.toSource(args.source);
        const breakpoints = args.breakpoints.map(breakpoint => this.toBreakpoint(source, breakpoint));
        return new BPRecipiesInUnbindedSource(source, breakpoints);
    }

    public toBreakpoint(source: IRequestedSourceIdentifier, clientBreakpoint: DebugProtocol.SourceBreakpoint): BPRecipieInUnbindedSource {
        return new BPRecipieInUnbindedSource(
            new LocationInUnbindedSource(source, this.toLocation(clientBreakpoint)),
            this.toBehaviorWhenExecuted(clientBreakpoint));
    }

    public toLocation(location: { line: number; column?: number; }): ZeroBasedLocation {
        const lineNumber = this._lineColTransformer.convertClientLineToDebugger(location.line) as LineNumber;
        const columnNumber = location.column !== undefined ? this._lineColTransformer.convertClientLineToDebugger(location.column) as ColumnNumber : undefined;
        return new ZeroBasedLocation(lineNumber, columnNumber);
    }

    public toBehaviorWhenExecuted(behavior: { condition?: string; hitCondition?: string; logMessage?: string; }): IBPBehavior {
        let howManyDefined = 0;
        howManyDefined += behavior.condition ? 1 : 0;
        howManyDefined += behavior.hitCondition ? 1 : 0;
        howManyDefined += behavior.logMessage ? 1 : 0;
        if (howManyDefined === 0) {
            return new AlwaysBreak();
        } else if (howManyDefined === 1) {
            if (behavior.condition) {
                return new ConditionalBreak(behavior.condition);
            } else if (behavior.hitCondition) {
                return new ConditionalBreak(behavior.hitCondition);
            } else if (behavior.logMessage) {
                return new ConditionalBreak(behavior.logMessage);
            } else {
                throw new Error(`Couldn't parse the desired behavior for the breakpoint: 'condition' (${behavior.condition}), 'hitCondition' (${behavior.hitCondition}) or 'logMessage' (${behavior.logMessage})`);
            }
        } else { // howManyDefined >= 2
            throw new Error(`Expected a single one of 'condition' (${behavior.condition}), 'hitCondition' (${behavior.hitCondition}) and 'logMessage' (${behavior.logMessage}) to be defined, yet multiple were defined.`);
        }
    }

    constructor(
        private readonly _handlesRegistry: HandlesRegistry,
        private readonly _lineColTransformer: NonNullable<LineColTransformer>,
        private readonly _sourcesLogic: SourcesLogic) { }
}