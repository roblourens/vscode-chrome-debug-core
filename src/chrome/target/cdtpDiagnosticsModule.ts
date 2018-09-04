import { TransformedListener } from '../communication/transformedListener';

export abstract class CDTPDiagnosticsModule<T> {
    protected abstract get api(): T;
}

export abstract class CDTPEventsEmitterDiagnosticsModule<T extends { on(eventName: string, listener: Function): void; }> extends CDTPDiagnosticsModule<T> {
    createEventListener<O, T>(eventName: string, transformation: (params: O) => Promise<T>): (transformedListener: ((params: T) => void)) => void {
        return transformedListener => new TransformedListener<O, T>(originalListener => {
            this.api.on(eventName, originalListener);
        }, transformation).registerListener(transformedListener);
    }
}