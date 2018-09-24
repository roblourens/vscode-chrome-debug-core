import { DebugProtocol } from 'vscode-debugprotocol';
import * as errors from '../../../errors';
import * as path from 'path';

import * as nls from 'vscode-nls';
import { PausedEvent } from '../../target/events';
import { SkipFilesLogic } from '../features/skipFiles';
import { SmartStepLogic } from '../features/smartStep';
import { StackTracePresentation, FramePresentationOrLabel, StackTraceLabel } from './stackTracePresentation';
import { ILoadedSource } from '../sources/loadedSource';
import { CodeFlowStackTrace } from './stackTrace';
import { IScript } from '../scripts/script';
import { CodeFlowFrame, ICallFrame, ScriptCallFrame, LoadedSourceCallFrame } from './callFrame';
import { LocationInLoadedSource } from '../locations/location';
import { CallFramePresentation, CallFramePresentationHint, SourcePresentationHint } from './callFramePresentation';
import { FormattedName } from './callFrameName';
import { IFeature } from '../features/feature';
import { ShouldPauseForUser } from '../features/pauseProgramWhenNeeded';
const localize = nls.loadMessageBundle();

export interface StackTraceDependencies {
    onShouldPauseForUser(listener: (params: PausedEvent) => Promise<ShouldPauseForUser>): void;
    onResumed(listener: () => void): void;
}

export class StackTracesLogic implements IFeature {
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

        const syncFames: FramePresentationOrLabel<ILoadedSource>[] = this._currentPauseEvent.callFrames.map(frame => this.toPresentation(frame, args.format));
        const asyncStackTrace = this._currentPauseEvent.asyncStackTrace;
        let stackFrames = asyncStackTrace ? syncFames.concat(this.asyncCallFrames(asyncStackTrace, args.format)) : syncFames;

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

    private asyncCallFrames(stackTrace: CodeFlowStackTrace<IScript>, formatArgs?: DebugProtocol.StackFrameFormat): FramePresentationOrLabel<ILoadedSource>[] {
        const asyncFrames: FramePresentationOrLabel<ILoadedSource>[] = stackTrace.codeFlowFrames
            .map(frame => this.toPresentation(this.codeFlowToCallFrame(frame), formatArgs));

        asyncFrames.unshift(new StackTraceLabel(stackTrace.description));

        return asyncFrames.concat(stackTrace.parent ? this.asyncCallFrames(stackTrace.parent, formatArgs) : []);
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

    private toPresentation(frame: ICallFrame<IScript>, formatArgs?: DebugProtocol.StackFrameFormat): CallFramePresentation<ILoadedSource> {
        // DIEGO TODO: Make getReadonlyOrigin work again
        // this.getReadonlyOrigin(frame.location.script.runtimeSource.identifier.textRepresentation)
        const additionalPresentationDetails = {
            additionalSourceOrigins: [] as string[],
            sourcePresentationHint: 'normal' as SourcePresentationHint
        };

        const locationInLoadedSource = frame.location.asLocationInLoadedSource();
        const isSourceMapped = locationInLoadedSource.source.isSourceOfCompiled();

        let presentationHint: CallFramePresentationHint = 'normal';

        // Apply hints to skipped frames
        const getSkipReason = (reason: string) => localize('skipReason', "(skipped by '{ 0}')", reason);
        if (this._skipFilesLogic.shouldSkipSource(locationInLoadedSource.source.identifier)) {
            additionalPresentationDetails.additionalSourceOrigins = [getSkipReason('skipFiles')];
            additionalPresentationDetails.sourcePresentationHint = 'deemphasize';
        } else if (this._smartStepLogic.isEnabled() && !isSourceMapped) {
            additionalPresentationDetails.additionalSourceOrigins = [getSkipReason('smartStep')];
            additionalPresentationDetails.sourcePresentationHint = 'deemphasize';
        }

        const formattedName = this.formatStackFrameName(frame.name, locationInLoadedSource, formatArgs);
        const codeFlow = new CodeFlowFrame<ILoadedSource>(frame.index, new FormattedName(formattedName), locationInLoadedSource);
        const callFrame = new LoadedSourceCallFrame(frame, codeFlow);

        return new CallFramePresentation<ILoadedSource>(callFrame, additionalPresentationDetails, presentationHint);
    }

    public install(): void {
        this._dependencies.onShouldPauseForUser(params => this.onPaused(params));
        this._dependencies.onResumed(() => this.onResumed());
    }

    constructor(
        private readonly _dependencies: StackTraceDependencies,
        private readonly _skipFilesLogic: SkipFilesLogic,
        private readonly _smartStepLogic: SmartStepLogic) {
    }
}