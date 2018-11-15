import { InformationAboutPausedProvider, NotifyStoppedCommonLogic, NotifyStoppedDependencies } from '../features/takeProperActionOnPausedEvent';
import { IComponent } from '../features/feature';
import { PausedEvent } from '../../target/events';
import * as errors from '../../../errors';
import { utils } from '../../..';
import { FormattedExceptionParser, FormattedExceptionParserDependencies, IFormattedExceptionLineDescription } from '../formattedExceptionParser';
import { PauseOnPromiseRejectionsStrategy, PauseOnExceptionsStrategy } from './strategies';
import { VoteRelevance, Vote, Abstained } from '../../communication/collaborativeDecision';
import { injectable } from 'inversify';

type ExceptionBreakMode = 'never' | 'always' | 'unhandled' | 'userUnhandled';

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

export interface PauseOnExceptionDependencies extends FormattedExceptionParserDependencies, NotifyStoppedDependencies {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    setPauseOnExceptions(strategy: PauseOnExceptionsStrategy): Promise<void>;
}

export class ExceptionWasThrown extends NotifyStoppedCommonLogic {
    public readonly relevance = VoteRelevance.NormalVote;
    public readonly reason = 'exception';

    constructor(protected readonly _dependencies: NotifyStoppedDependencies) {
        super();
    }
}

export class PromiseWasRejected extends NotifyStoppedCommonLogic {
    public readonly relevance = VoteRelevance.NormalVote;
    public readonly reason = 'promise_rejection';

    constructor(protected readonly _dependencies: NotifyStoppedDependencies) {
        super();
    }
}

@injectable()
export class PauseOnExceptionOrRejection implements IComponent {
    private _promiseRejectionsStrategy: PauseOnPromiseRejectionsStrategy;

    private _lastException: any;

    public setExceptionsStrategy(strategy: PauseOnExceptionsStrategy): Promise<void> {
        return this._dependencies.setPauseOnExceptions(strategy);
    }

    public setPromiseRejectionStrategy(promiseRejectionsStrategy: PauseOnPromiseRejectionsStrategy): void {
        this._promiseRejectionsStrategy = promiseRejectionsStrategy;
    }

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<Vote<void>> {
        if (paused.reason === 'exception') {
            // If we are here is because we either configured the debugee to pauser on unhandled or handled exceptions
            this._lastException = paused.data;
            return new ExceptionWasThrown(this._dependencies);
        } else if (paused.reason === 'promiseRejection' && this._promiseRejectionsStrategy.shouldPauseOnRejections()) {
            // TODO: Figure out if it makes sense to move this into it's own class
            this._lastException = paused.data;
            return new PromiseWasRejected(this._dependencies);
        } else {
            this._lastException = null;
            return new Abstained();
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
                    stackTrace: this._lastException.description && await new FormattedExceptionParser(this._dependencies, this._lastException.description).parse(),
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

    constructor(private readonly _dependencies: PauseOnExceptionDependencies) { }
}