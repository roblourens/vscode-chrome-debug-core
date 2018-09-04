import { DebugProtocol } from 'vscode-debugprotocol';
import { CallFramePresentationOrLabel, StackTraceCodeFlow, StackTraceLabel, CallFrameCodeFlow, CallFrame, CallFramePresentation, IAdditionalPresentationDetails, CallFramePresentationHint, FormattedName, StackTracePresentation, ScriptCallFrame } from './stackTraces';
import { IScript } from './script';
import { CDTPDiagnostics } from '../target/cdtpDiagnostics';
import { PausedEvent } from '../target/events';
import * as errors from '../../errors';
import * as path from 'path';
import { ILoadedSource } from './loadedSource';
import { SkipFilesLogic } from './features/skipFiles';
import { SmartStepLogic } from './features/smartStep';

import * as nls from 'vscode-nls';
import { LocationInLoadedSource } from './locationInResource';
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

        const syncFames: CallFramePresentationOrLabel<ILoadedSource>[] = this._currentPauseNotification.callFrames.map(frame => this.toPresentation(frame, args.format));
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

    private asyncCallFrames(stackTrace: StackTraceCodeFlow<IScript>, formatArgs?: DebugProtocol.StackFrameFormat): CallFramePresentationOrLabel<ILoadedSource>[] {
        const asyncFrames: CallFramePresentationOrLabel<ILoadedSource>[] = stackTrace.callFrames
            .map(frame => this.toPresentation(this.codeFlowToCallFrame(frame), formatArgs));

        asyncFrames.unshift(new StackTraceLabel(stackTrace.description));

        return asyncFrames.concat(stackTrace.parent ? this.asyncCallFrames(stackTrace.parent, formatArgs) : []);
    }

    private codeFlowToCallFrame(frame: CallFrameCodeFlow<IScript>): CallFrame<IScript> {
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
        const codeFlow = new CallFrameCodeFlow<ILoadedSource>(frame.index, new FormattedName(formattedName), locationInLoadedSource);

        return new CallFramePresentation<ILoadedSource>(codeFlow, additionalPresentationDetails, presentationHint);
    }
}