import { ILoadedSource } from '../internal/loadedSource';
import { ISession } from './delayMessagesUntilInitializedSession';
import { LoadedSourceEvent, OutputEvent } from 'vscode-debugadapter';
import { InternalToClient } from './internalToClient';
import { DebugProtocol } from 'vscode-debugprotocol';
import { LocationInLoadedSource } from '../internal/locationInResource';

export class EventSender {
    public sendOutput(params: { output: NonNullable<string>, category: NonNullable<string>, variablesReference?: number; location?: LocationInLoadedSource }): any {
        const event = new OutputEvent(params.output, params.category) as DebugProtocol.OutputEvent;
        if (params.variablesReference) {
            event.body.variablesReference = params.variablesReference;
        }
        if (params.location) {
            this._internalToClient.toLocationInSource(params.location, event.body);
        }
        this._session.sendEvent(event);
    }

    public async sendSourceWasLoaded(reason: 'new' | 'changed' | 'removed', source: ILoadedSource): Promise<void> {
        const vsCodeSource = await this._internalToClient.toSource(source);
        const event = new LoadedSourceEvent(reason, vsCodeSource);

        this._session.sendEvent(event);
    }

    constructor(private readonly _session: ISession, private readonly _internalToClient: InternalToClient) {
    }
}