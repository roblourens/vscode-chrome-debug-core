import { ShouldPauseForUserListener, ShouldPauseForUser } from './pauseProgramWhenNeeded';
import { IFeature } from './feature';
import { PausedEvent } from '../../target/events';
import * as errors from '../../../errors';
import { utils } from '../../..';
import { FormattedExceptionParser, FormattedExceptionParserDependencies, IFormattedExceptionLineDescription } from '../formattedExceptionParser';

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

export interface PauseOnExceptionDependencies extends FormattedExceptionParserDependencies {
    onShouldPauseForUser(listener: ShouldPauseForUserListener): void;
}

export class PauseOnException implements IFeature {
    private _lastException: any;

    public async onShouldPauseForUser(notification: PausedEvent): Promise<ShouldPauseForUser> {
        if (notification.reason === 'exception') {
            this._lastException = notification.data;

            return ShouldPauseForUser.NeedsToPause;
        } else {
            return ShouldPauseForUser.Abstained;
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

    public install(): PauseOnException {
        this._dependencies.onShouldPauseForUser(paused => this.onShouldPauseForUser(paused));
        return this;
    }

    constructor(private readonly _dependencies: PauseOnExceptionDependencies) { }
}