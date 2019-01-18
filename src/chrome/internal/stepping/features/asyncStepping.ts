/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { IComponent } from '../../features/feature';
import { InformationAboutPausedProvider, ResumeCommonLogic } from '../../features/takeProperActionOnPausedEvent';
import { VoteRelevance, IVote, Abstained } from '../../../communication/collaborativeDecision';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../../dependencyInjection.ts/types';
import { PausedEvent } from '../../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { IDebugeeExecutionController } from '../../../cdtpDebuggee/features/cdtpDebugeeExecutionController';
import { IDebugeeSteppingController } from '../../../cdtpDebuggee/features/cdtpDebugeeSteppingController';

export interface IEventsConsumedByAsyncStepping {
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
    public async askForInformationAboutPaused(paused: PausedEvent): Promise<IVote<void>> {
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
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: IEventsConsumedByAsyncStepping,
        @inject(TYPES.IDebugeeExecutionControl) private readonly _debugeeExecutionControl: IDebugeeExecutionController,
        @inject(TYPES.IDebugeeSteppingController) private readonly _debugeeStepping: IDebugeeSteppingController) { }
}