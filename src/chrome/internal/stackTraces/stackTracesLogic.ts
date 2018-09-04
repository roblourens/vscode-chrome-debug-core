import { DebugProtocol } from 'vscode-debugprotocol';
import * as errors from '../../../errors';
import * as path from 'path';

import * as nls from 'vscode-nls';
import { PausedEvent } from '../../target/events';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { SkipFilesLogic } from '../features/skipFiles';
import { SmartStepLogic } from '../features/smartStep';
import { StackTracePresentation, FramePresentationOrLabel, StackTraceLabel } from './stackTracePresentation';
import { ILoadedSource } from '../sources/loadedSource';
import { CodeFlowStackTrace } from './stackTrace';
import { IScript } from '../scripts/script';
import { CodeFlowFrame, CallFrame, ScriptCallFrame, LoadedSourceCallFrame } from './callFrame';
import { LocationInLoadedSource } from '../locations/locationInResource';
import { CallFramePresentation, IAdditionalPresentationDetails, CallFramePresentationHint } from './callFramePresentation';
import { FormattedName } from './callFrameName';
const localize = nls.loadMessageBundle();

export class StackTracesLogic {
    private _currentPauseNotification: PausedEvent | null = null;

    public onResumed(): any {
        this._currentPauseNotification = null;
    }

    public onPaused(params: PausedEvent): any {
        this._currentPauseNotification = params;
    }

    constructor(chromeDiagnostics: CDTPDiagnostics,
        private readonly _skipFilesLogic: SkipFilesLogic,
        private readonly _smartStepLogic: SmartStepLogic) {
        chromeDiagnostics.Debugger.onPaused(params => this.onPaused(params));
        chromeDiagnostics.Debugger.onResumed(() => this.onResumed());
    }

    public async stackTrace(args: DebugProtocol.StackTraceArguments): Promise<StackTracePresentation> {
        if (!this._currentPauseNotification) {
            return Promise.reject(errors.noCallStackAvailable());
        }

        const syncFames: FramePresentationOrLabel<ILoadedSource>[] = this._currentPauseNotification.callFrames.map(frame => this.toPresentation(frame, args.format));
        const asyncStackTrace = this._currentPauseNotification.asyncStackTrace;
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

    private codeFlowToCallFrame(frame: CodeFlowFrame<IScript>): CallFrame<IScript> {
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

    private toPresentation(frame: CallFrame<IScript>, formatArgs?: DebugProtocol.StackFrameFormat): CallFramePresentation<ILoadedSource> {
        // DIEGO TODO: Make getReadonlyOrigin work again
        // this.getReadonlyOrigin(frame.location.script.runtimeSource.identifier.textRepresentation)
        const additionalPresentationDetails: IAdditionalPresentationDetails = {
            additionalSourceOrigins: [],
            sourcePresentationHint: 'normal'
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
}