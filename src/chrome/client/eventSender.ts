/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ILoadedSource } from '../internal/sources/loadedSource';
import { ISession } from './session';
import { LoadedSourceEvent, OutputEvent, BreakpointEvent } from 'vscode-debugadapter';
import { InternalToClient } from './internalToClient';
import { DebugProtocol } from 'vscode-debugprotocol';
import { LocationInLoadedSource } from '../internal/locations/location';
import { IBPRecipieStatus } from '../internal/breakpoints/bpRecipieStatus';
import { IFormattedExceptionLineDescription } from '../internal/formattedExceptionParser';
import { StoppedEvent2, ReasonType } from '../stoppedEvent';
import { injectable, inject } from 'inversify';
import { TYPES } from '../dependencyInjection.ts/types';
import { Protocol as CDTP } from 'devtools-protocol';
import { ChromeDebugLogic } from '../chromeDebugAdapter';

export interface IOutputParameters {
    readonly output: string;
    readonly category: string;
    readonly variablesReference?: number;
    readonly location?: LocationInLoadedSource;
}

export interface ISourceWasLoadedParameters {
    readonly reason: 'new' | 'changed' | 'removed';
    readonly source: ILoadedSource;
}

export interface IBPStatusChangedParameters {
    readonly reason: string;
    readonly bpRecipieStatus: IBPRecipieStatus;
}

export interface IExceptionThrownParameters {
    readonly exceptionStackTrace: IFormattedExceptionLineDescription[];
    readonly category: string;
    readonly location?: LocationInLoadedSource;
}

export interface IDebugeeIsStoppedParameters {
    reason: ReasonType;
    exception?: CDTP.Runtime.RemoteObject;
}

export interface IEventsToClientReporter {
    sendOutput(params: IOutputParameters): void;
    sendSourceWasLoaded(params: ISourceWasLoadedParameters): Promise<void>;
    sendBPStatusChanged(params: IBPStatusChangedParameters): Promise<void>;
    sendExceptionThrown(params: IExceptionThrownParameters): Promise<void>;
    sendDebuggeeIsStopped(params: IDebugeeIsStoppedParameters): Promise<void>;
}

@injectable()
export class EventSender implements IEventsToClientReporter {
    public sendOutput(params: IOutputParameters): void {
        const event = new OutputEvent(params.output, params.category) as DebugProtocol.OutputEvent;

        if (params.variablesReference) {
            event.body.variablesReference = params.variablesReference;
        }

        if (params.location) {
            this._internalToClient.toLocationInSource(params.location, event.body);
        }

        this._session.sendEvent(event);
    }

    public async sendSourceWasLoaded(params: ISourceWasLoadedParameters): Promise<void> {
        const clientSource = await this._internalToClient.toSource(params.source);
        const event = new LoadedSourceEvent(params.reason, clientSource);

        this._session.sendEvent(event);
    }

    public async sendBPStatusChanged(params: IBPStatusChangedParameters): Promise<void> {
        const breakpointStatus = await this._internalToClient.toBPRecipieStatus(params.bpRecipieStatus);
        const event = new BreakpointEvent(params.reason, breakpointStatus);

        this._session.sendEvent(event);
    }

    public async sendExceptionThrown(params: IExceptionThrownParameters): Promise<void> {
        return this.sendOutput({
            output: this._internalToClient.toExceptionStackTracePrintted(params.exceptionStackTrace),
            category: params.category,
            location: params.location
        });
    }

    public async sendDebuggeeIsStopped(params: IDebugeeIsStoppedParameters): Promise<void> {
        return this._session.sendEvent(new StoppedEvent2(params.reason, /*threadId=*/ChromeDebugLogic.THREAD_ID, params.exception));
    }

    constructor(
        @inject(TYPES.ISession) private readonly _session: ISession,
        private readonly _internalToClient: InternalToClient) { }
}
