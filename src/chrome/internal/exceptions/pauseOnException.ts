/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { InformationAboutPausedProvider, NotifyStoppedCommonLogic } from '../features/takeProperActionOnPausedEvent';
import { IComponent } from '../features/feature';
import * as errors from '../../../errors';
import { utils } from '../../..';
import { FormattedExceptionParser, IFormattedExceptionLineDescription } from '../formattedExceptionParser';
import { IPauseOnPromiseRejectionsStrategy, IPauseOnExceptionsStrategy } from './strategies';
import { VoteRelevance, IVote, Abstained } from '../../communication/collaborativeDecision';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';
import { IEventsToClientReporter } from '../../client/eventSender';
import { DeleteMeScriptsRegistry } from '../scripts/scriptsRegistry';
import { PausedEvent } from '../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { IPauseOnExceptionsConfigurer } from '../../cdtpDebuggee/features/cdtpPauseOnExceptionsConfigurer';

type ExceptionBreakMode = 'never' | 'always' | 'unhandled' | 'userUnhandled';

export type Dummy = VoteRelevance; // If we don't do this the .d.ts doesn't include VoteRelevance and the compilation fails. Remove this when the issue disappears...

export interface IExceptionInformationDetails {
    readonly stackTrace: IFormattedExceptionLineDescription[];
    readonly message: string;
    readonly formattedDescription: string;
    readonly typeName: string;
}

export interface IExceptionInformation {
    readonly exceptionId: string;
    readonly description?: string;
    readonly breakMode: ExceptionBreakMode;
    readonly details?: IExceptionInformationDetails;
}

export interface IEventsConsumedByPauseOnException {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    publishGoingToPauseClient(): void;
}

export class ExceptionWasThrown extends NotifyStoppedCommonLogic {
    public readonly relevance = VoteRelevance.NormalVote;
    public readonly reason = 'exception'; // There is an issue of how the .d.ts is generated for this file, so we need to type that explicitly

    constructor(protected readonly _eventsToClientReporter: IEventsToClientReporter,
        protected readonly _publishGoingToPauseClient: () => void) {
        super();
    }
}

export class PromiseWasRejected extends NotifyStoppedCommonLogic {
    public readonly relevance = VoteRelevance.NormalVote;
    public readonly reason: 'promise_rejection' = 'promise_rejection'; // There is an issue of how the .d.ts is generated for this file, so we need to type that explicitly

    constructor(protected readonly _eventsToClientReporter: IEventsToClientReporter,
        protected readonly _publishGoingToPauseClient: () => void) {
        super();
    }
}

@injectable()
export class PauseOnExceptionOrRejection implements IComponent {
    private _promiseRejectionsStrategy: IPauseOnPromiseRejectionsStrategy;

    private _lastException: any;

    public setExceptionsStrategy(strategy: IPauseOnExceptionsStrategy): Promise<void> {
        return this._pauseOnExceptions.setPauseOnExceptions(strategy);
    }

    public setPromiseRejectionStrategy(promiseRejectionsStrategy: IPauseOnPromiseRejectionsStrategy): void {
        this._promiseRejectionsStrategy = promiseRejectionsStrategy;
    }

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<IVote<void>> {
        if (paused.reason === 'exception') {
            // If we are here is because we either configured the debugee to pauser on unhandled or handled exceptions
            this._lastException = paused.data;
            return new ExceptionWasThrown(this._eventsToClientReporter, this._dependencies.publishGoingToPauseClient);
        } else if (paused.reason === 'promiseRejection' && this._promiseRejectionsStrategy.shouldPauseOnRejections()) {
            // TODO: Figure out if it makes sense to move this into it's own class
            this._lastException = paused.data;
            return new PromiseWasRejected(this._eventsToClientReporter, this._dependencies.publishGoingToPauseClient);
        } else {
            this._lastException = null;
            return new Abstained(this);
        }
    }

    public async latestExceptionInfo(): Promise<IExceptionInformation> {
        if (this._lastException) {
            const isError = this._lastException.subtype === 'error';
            const message = isError ? utils.firstLine(this._lastException.description) : (this._lastException.description || this._lastException.value);
            const formattedMessage = message && message.replace(/\*/g, '\\*');
            const response: IExceptionInformation = {
                exceptionId: this._lastException.className || this._lastException.type || 'Error',
                breakMode: 'unhandled',
                details: {
                    stackTrace: this._lastException.description && await new FormattedExceptionParser(this._scriptsLogic, this._lastException.description).parse(),
                    message,
                    formattedDescription: formattedMessage, // VS workaround - see https://github.com/Microsoft/client/issues/34259
                    typeName: this._lastException.subtype || this._lastException.type
                }
            };

            return response;
        } else {
            throw errors.noStoredException();
        }
    }

    public install(): this {
        this._dependencies.subscriberForAskForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
        return this;
    }

    constructor(@inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: IEventsConsumedByPauseOnException,
        @inject(TYPES.DeleteMeScriptsRegistry) private readonly _scriptsLogic: DeleteMeScriptsRegistry,
        @inject(TYPES.IPauseOnExceptions) private readonly _pauseOnExceptions: IPauseOnExceptionsConfigurer,
        @inject(TYPES.IEventsToClientReporter) private readonly _eventsToClientReporter: IEventsToClientReporter) { }
}