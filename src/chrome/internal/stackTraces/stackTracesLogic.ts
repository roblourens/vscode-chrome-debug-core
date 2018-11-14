import { DebugProtocol } from 'vscode-debugprotocol';
import * as errors from '../../../errors';
import * as path from 'path';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();
import { PausedEvent } from '../../target/events';
import { StackTracePresentation, FramePresentationOrLabel, StackTraceLabel } from './stackTracePresentation';
import { ILoadedSource } from '../sources/loadedSource';
import { CodeFlowStackTrace } from './stackTrace';
import { IScript } from '../scripts/script';
import { CodeFlowFrame, ICallFrame, ScriptCallFrame, LoadedSourceCallFrame } from './callFrame';
import { LocationInLoadedSource } from '../locations/location';
import { CallFramePresentation, CallFramePresentationHint, SourcePresentationHint, ICallFramePresentationDetails } from './callFramePresentation';
import { FormattedName } from './callFrameName';
import { IFeature } from '../features/feature';
import { InformationAboutPausedProvider } from '../features/takeProperActionOnPausedEvent';
import { ExecuteDecisionBasedOnVotes, Vote } from '../../communication/collaborativeDecision';
import { asyncMap } from '../../collections/async';
import { PromiseOrNot } from '../../utils/promises';

export interface StackTraceDependencies {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    onResumed(listener: () => void): void;
    setAsyncCallStackDepth(maxDepth: number): Promise<void>;
    publishCallFrameAdditionalPresentationDetailsElection(locationInLoadedSource: LocationInLoadedSource): PromiseOrNot<Vote<ICallFramePresentationDetails>[]>;
}

export interface IStackTracesConfiguration {
    showAsyncStacks: boolean;
}

export class StackTracesLogic implements IFeature<IStackTracesConfiguration> {
    public static ASYNC_CALL_STACK_DEPTH = 4;

    private _currentPauseEvent: PausedEvent | null = null;

    public onResumed(): any {
        this._currentPauseEvent = null;
    }

    public onPaused(pausedEvent: PausedEvent): any {
        this._currentPauseEvent = pausedEvent;
    }

    public async stackTrace(args: DebugProtocol.StackTraceArguments): Promise<StackTracePresentation> {
        if (!this._currentPauseEvent) {
            return Promise.reject(errors.noCallStackAvailable());
        }

        const syncFames: FramePresentationOrLabel<ILoadedSource>[] = await asyncMap(this._currentPauseEvent.callFrames, frame => this.toPresentation(frame, args.format));
        const asyncStackTrace = this._currentPauseEvent.asyncStackTrace;
        let stackFrames = asyncStackTrace ? syncFames.concat(await this.asyncCallFrames(asyncStackTrace, args.format)) : syncFames;

        const totalFrames = stackFrames.length;
        if (typeof args.startFrame === 'number') {
            stackFrames = stackFrames.slice(args.startFrame);
        }

        if (typeof args.levels === 'number') {
            stackFrames = stackFrames.slice(0, args.levels);
        }

        const stackTraceResponse: StackTracePresentation = {
            stackFrames,
            totalFrames
        };

        return stackTraceResponse;
    }

    private async asyncCallFrames(stackTrace: CodeFlowStackTrace<IScript>, formatArgs?: DebugProtocol.StackFrameFormat): Promise<FramePresentationOrLabel<ILoadedSource>[]> {
        const asyncFrames: FramePresentationOrLabel<ILoadedSource>[] = await asyncMap(stackTrace.codeFlowFrames,
            frame => this.toPresentation(this.codeFlowToCallFrame(frame), formatArgs));

        asyncFrames.unshift(new StackTraceLabel(stackTrace.description));

        return asyncFrames.concat(stackTrace.parent ? await this.asyncCallFrames(stackTrace.parent, formatArgs) : []);
    }

    private codeFlowToCallFrame(frame: CodeFlowFrame<IScript>): ICallFrame<IScript> {
        return new ScriptCallFrame(frame, [], undefined, undefined);
    }

    private formatStackFrameName(name: string, locationInLoadedSource: LocationInLoadedSource, formatArgs?: DebugProtocol.StackFrameFormat): string {
        let formattedName = name;
        if (formatArgs) {
            if (formatArgs.module) {
                formattedName += ` [${path.basename(locationInLoadedSource.source.identifier.textRepresentation)}]`;
            }

            if (formatArgs.line) {
                formattedName += ` Line ${locationInLoadedSource.lineNumber}`;
            }
        }

        return formattedName;
    }

    private async toPresentation(frame: ICallFrame<IScript>, formatArgs?: DebugProtocol.StackFrameFormat): Promise<CallFramePresentation<ILoadedSource>> {
        // DIEGO TODO: Make getReadonlyOrigin work again
        // this.getReadonlyOrigin(frame.location.script.runtimeSource.identifier.textRepresentation)
        const locationInLoadedSource = frame.location.asLocationInLoadedSource();

        let presentationHint: CallFramePresentationHint = 'normal';

        // Apply hints to skipped frames
        const getSkipReason = (reason: string) => localize('skipReason', "(skipped by '{0}')", reason);
        const votes = await this._dependencies.publishCallFrameAdditionalPresentationDetailsElection(locationInLoadedSource);
        const result = await new ExecuteDecisionBasedOnVotes(() => ({
            additionalSourceOrigins: [] as string[],
            sourcePresentationHint: 'normal' as SourcePresentationHint
        }), votes).execute();

        const presentationDetails: ICallFramePresentationDetails = {
            additionalSourceOrigins: [getSkipReason(result.additionalSourceOrigins.join(','))],
            sourcePresentationHint: result.sourcePresentationHint
        };

        const formattedName = this.formatStackFrameName(frame.name, locationInLoadedSource, formatArgs);
        const codeFlow = new CodeFlowFrame<ILoadedSource>(frame.index, new FormattedName(formattedName), locationInLoadedSource);
        const callFrame = new LoadedSourceCallFrame(frame, codeFlow);

        return new CallFramePresentation<ILoadedSource>(callFrame, presentationDetails, presentationHint);
    }

    public async install(configuration: IStackTracesConfiguration): Promise<this> {
        this._dependencies.subscriberForAskForInformationAboutPaused(params => this.onPaused(params));
        this._dependencies.onResumed(() => this.onResumed());
        return await this.configure(configuration);
    }

    private async configure(configuration: IStackTracesConfiguration): Promise<this> {
        const maxDepth = configuration.showAsyncStacks ? StackTracesLogic.ASYNC_CALL_STACK_DEPTH : 0;

        try {
            await this._dependencies.setAsyncCallStackDepth(maxDepth);
        } catch (e) {
            // Not supported by older runtimes, ignore it.
        }
        return this;
    }

    constructor(private readonly _dependencies: StackTraceDependencies) {
    }
}