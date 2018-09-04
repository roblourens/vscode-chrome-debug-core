// TODO DIEGO: Do this another way. This will only trigger if the module is used after startup
class APIRecorder {
    private readonly _listeners = [] as any as [{ event: string, listener: Function }];

    public on(event: string, listener: Function) {
        this._listeners.push({ event, listener });
    }

    public subscribeToRealAPI(api: { on(event: string, listener: Function): void }) {
        this._listeners.forEach(eventAndListener => api.on(eventAndListener.event, eventAndListener.listener));
    }
}

export abstract class CDTPDiagnosticsModule<T> {
    private _api: T | null = null;
    private _apiRecorder = new APIRecorder();

    protected get api(): T {
        if (this._api === null) {
            try {
                this._api = this._getModuleApi();
            } catch (exception) {
// TODO DIEGO: Do this another way. This will only trigger if the module is used after startup

            }
            if (this._api) {
                this._apiRecorder.subscribeToRealAPI(this._api as any);
                this.onApiAvailable();
            } else {
                // If the API is still not available, return the fake API recorder instead
                return this._apiRecorder as any as T;
            }
        }
        return this._api;
    }
    protected onApiAvailable(): void {
        // Subclasses can use this method to perform work after the API becomes available
    }
    constructor(private _getModuleApi: () => T) { }
}