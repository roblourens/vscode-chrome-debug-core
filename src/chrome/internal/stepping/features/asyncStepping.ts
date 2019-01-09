import { IComponent } from '../../features/feature';
import { InformationAboutPausedProvider, ResumeCommonLogic } from '../../features/takeProperActionOnPausedEvent';
import { VoteRelevance, Vote, Abstained } from '../../../communication/collaborativeDecision';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../../dependencyInjection.ts/types';
import { PausedEvent } from '../../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { IDebugeeExecutionController } from '../../../cdtpDebuggee/features/cdtpDebugeeExecutionController';
import { IDebugeeSteppingController } from '../../../cdtpDebuggee/features/CDTPDebugeeSteppingController';

export interface EventsConsumedByAsyncStepping {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
}

export class PausedBecauseAsyncCallWasScheduled extends ResumeCommonLogic {
    public readonly relevance = VoteRelevance.FallbackVote;

    constructor(protected _debugeeExecutionControl: IDebugeeExecutionController) {
        super();
    }
}

@injectable()
export class AsyncStepping implements IComponent {
    public async askForInformationAboutPaused(paused: PausedEvent): Promise<Vote<void>> {
        if (paused.asyncCallStackTraceId) {
            await this._debugeeStepping.pauseOnAsyncCall({ parentStackTraceId: paused.asyncCallStackTraceId });
            return new PausedBecauseAsyncCallWasScheduled(this._debugeeExecutionControl);
        }

        return new Abstained(this);
    }

    public install(): void {
        this._dependencies.subscriberForAskForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
    }

    constructor(
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: EventsConsumedByAsyncStepping,
        @inject(TYPES.IDebugeeExecutionControl) private readonly _debugeeExecutionControl: IDebugeeExecutionController,
        @inject(TYPES.IDebugeeSteppingController) private readonly _debugeeStepping: IDebugeeSteppingController) { }
}