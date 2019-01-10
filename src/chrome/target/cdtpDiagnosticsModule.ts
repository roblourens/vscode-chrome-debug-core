import { TransformedListenerRegistry } from '../communication/transformedListenerRegistry';
import { PromiseOrNot } from '../utils/promises';
import { injectable } from 'inversify';

export interface IEnableableApi<EnableParameters = void, EnableResponse = void> {
    enable(parameters: EnableParameters): Promise<EnableResponse>;
}

@injectable()
export abstract class CDTPEnableableDiagnosticsModule<T extends IEnableableApi<EnableParameters, EnableResponse>, EnableParameters = void, EnableResponse = void> {
    protected abstract get api(): T;

    // TODO DIEGO IMPORTANT: Figure out how to ensure that the Enable messages get sent after we declare or the event subscribers. They also need to follow the dependencies order
    public enable(): EnableParameters extends void ? Promise<EnableResponse> : never;
    public enable(parameters: EnableParameters): Promise<EnableResponse>;
    public async enable(parameters?: EnableParameters): Promise<EnableResponse> {
        return await this.api.enable(parameters);
    }
}

@injectable()
export abstract class CDTPEventsEmitterDiagnosticsModule<T extends { on(eventName: string, listener: Function): void; } & IEnableableApi<EnableParameters, EnableResponse>, EnableParameters = void, EnableResponse = void>
    extends CDTPEnableableDiagnosticsModule<T, EnableParameters, EnableResponse> {
    public addApiListener<O, T>(eventName: string, transformation: (params: O) => PromiseOrNot<T>): (transformedListener: ((params: T) => void)) => void {
        /**
         * We don't want the constructor of the subclass to be async (It's also not allowed). We want the onScriptParsed() method to wait on enabling the domain before setting the handler if neccesary
         * so we store the TransformedListenerRegistry as a promise.
         */
        const transformedListenerRegistryPromise = new TransformedListenerRegistry<O, T>(this.constructor.name, async originalListener => {
            this.api.on(eventName, originalListener);
        }, transformation).install();
        return async transformedListener => (await transformedListenerRegistryPromise).registerListener(transformedListener);
    }
}