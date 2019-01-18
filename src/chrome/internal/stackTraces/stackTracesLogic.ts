import { DebugProtocol } from 'vscode-debugprotocol';
import { injectable, inject } from 'inversify';

import * as errors from '../../../errors';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();
import { PausedEvent } from '../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { CodeFlowStackTrace } from './codeFlowStackTrace';
import { IScript } from '../scripts/script';
import { CodeFlowFrame, ScriptCallFrame } from './callFrame';
import { LocationInLoadedSource } from '../locations/location';
import { CallFramePresentation, SourcePresentationHint, ICallFramePresentationDetails } from './callFramePresentation';
import { IComponent, ComponentConfiguration } from '../features/feature';
import { InformationAboutPausedProvider } from '../features/takeProperActionOnPausedEvent';
import { asyncMap } from '../../collections/async';
import { TYPES } from '../../dependencyInjection.ts/types';
import { ConnectedCDAConfiguration } from '../../..';
import { Vote, Abstained } from '../../communication/collaborativeDecision';
import { IAsyncDebuggingConfigurer } from '../../cdtpDebuggee/features/CDTPAsyncDebuggingConfigurer';
import { IStackTracePresentationRow, StackTraceLabel, CallFramePresentationHint } from './stackTracePresentationRow';
import { IStackTracePresentation } from './stackTracePresentation';

export interface EventsConsumedByStackTrace {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    onResumed(listener: () => void): void;
}

export interface IStackTracePresentationLogicProvider {
    getCallFrameAdditionalDetails(locationInLoadedSource: LocationInLoadedSource): ICallFramePresentationDetails[];
}

export interface IStackTracesConfiguration {
    showAsyncStacks: boolean;
}

@injectable()
export class StackTracesLogic implements IComponent {
    public static ASYNC_CALL_STACK_DEPTH = 4;

    private _currentPauseEvent: PausedEvent | null = null;

    public onResumed(): any {
        this._currentPauseEvent = null;
    }

    public async onPaused(pausedEvent: PausedEvent): Promise<Vote<void>> {
        this._currentPauseEvent = pausedEvent;
        return new Abstained(this);
    }

    public async stackTrace(args: DebugProtocol.StackTraceArguments): Promise<IStackTracePresentation> {
        if (!this._currentPauseEvent) {
            return Promise.reject(errors.noCallStackAvailable());
        }

        const syncFames: IStackTracePresentationRow[] = await asyncMap(this._currentPauseEvent.callFrames, frame => this.toPresentation(frame, args.format));
        const asyncStackTrace = this._currentPauseEvent.asyncStackTrace;
        let stackFrames = asyncStackTrace ? syncFames.concat(await this.asyncCallFrames(asyncStackTrace, args.format)) : syncFames;

        const totalFrames = stackFrames.length;
        if (typeof args.startFrame === 'number') {
            stackFrames = stackFrames.slice(args.startFrame);
        }

        if (typeof args.levels === 'number') {
            stackFrames = stackFrames.slice(0, args.levels);
        }

        const stackTraceResponse: IStackTracePresentation = {
            stackFrames,
            totalFrames
        };

        return stackTraceResponse;
    }

    private async asyncCallFrames(stackTrace: CodeFlowStackTrace, formatArgs?: DebugProtocol.StackFrameFormat): Promise<IStackTracePresentationRow[]> {
        const asyncFrames: IStackTracePresentationRow[] = await asyncMap(stackTrace.codeFlowFrames,
            frame => this.toPresentation(this.codeFlowToCallFrame(frame), formatArgs));

        asyncFrames.unshift(new StackTraceLabel(stackTrace.description));

        return asyncFrames.concat(stackTrace.parent ? await this.asyncCallFrames(stackTrace.parent, formatArgs) : []);
    }

    private codeFlowToCallFrame(frame: CodeFlowFrame<IScript>): ScriptCallFrame {
        return new ScriptCallFrame(frame, [], undefined, undefined);
    }

    private async toPresentation(frame: ScriptCallFrame, formatArgs?: DebugProtocol.StackFrameFormat): Promise<CallFramePresentation> {
        // DIEGO TODO: Make getReadonlyOrigin work again
        // this.getReadonlyOrigin(frame.location.script.runtimeSource.identifier.textRepresentation)
        let presentationHint: CallFramePresentationHint = 'normal';

        // Apply hints to skipped frames
        const getSkipReason = (reason: string) => localize('skipReason', "(skipped by '{0}')", reason);
        const locationInLoadedSource = frame.location.mappedToSource();
        const providedDetails: ICallFramePresentationDetails[] = [].concat(await asyncMap([this._stackTracePresentationLogicProviders], provider =>
            provider.getCallFrameAdditionalDetails(locationInLoadedSource)));
        const actualDetails = providedDetails.length === 0
            ? [{
                additionalSourceOrigins: [] as string[],
                sourcePresentationHint: 'normal' as SourcePresentationHint
            }]
            : providedDetails; // Here we guarantee that actualDetails.length > 0
        const allAdditionalSourceOrigins = await asyncMap(actualDetails, detail => detail.additionalSourceOrigins);

        const presentationDetails: ICallFramePresentationDetails = {
            additionalSourceOrigins: [getSkipReason(allAdditionalSourceOrigins.join(','))],
            sourcePresentationHint: actualDetails[0].sourcePresentationHint // We know that actualDetails.length > 0
        };

        return new CallFramePresentation(frame.mappedToSource(),
            formatArgs, presentationDetails, presentationHint);
    }

    public async install(): Promise<this> {
        this._dependencies.subscriberForAskForInformationAboutPaused(params => this.onPaused(params));
        this._dependencies.onResumed(() => this.onResumed());
        return await this.configure(this._configuration);
    }

    private async configure(configuration: ComponentConfiguration): Promise<this> {
        const showAsyncStacks = typeof configuration.args.showAsyncStacks === 'undefined' || configuration.args.showAsyncStacks;
        const maxDepth = showAsyncStacks ? StackTracesLogic.ASYNC_CALL_STACK_DEPTH : 0;

        try {
            await this._breakpointFeaturesSupport.setAsyncCallStackDepth(maxDepth);
        } catch (e) {
            // Not supported by older runtimes, ignore it.
        }
        return this;
    }

    constructor(
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: EventsConsumedByStackTrace,
        // TODO DIEGO: @multiInject(new LazyServiceIdentifer(() => TYPES.IStackTracePresentationLogicProvider)) private readonly _stackTracePresentationLogicProviders: IStackTracePresentationLogicProvider[],
        @inject(TYPES.IStackTracePresentationLogicProvider) private readonly _stackTracePresentationLogicProviders: IStackTracePresentationLogicProvider,
        @inject(TYPES.IAsyncDebuggingConfiguration) private readonly _breakpointFeaturesSupport: IAsyncDebuggingConfigurer,
        @inject(TYPES.ConnectedCDAConfiguration) private readonly _configuration: ConnectedCDAConfiguration) {
    }
}