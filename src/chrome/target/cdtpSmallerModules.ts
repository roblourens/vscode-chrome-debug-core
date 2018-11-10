import { CDTPDiagnosticsModule, CDTPEventsEmitterDiagnosticsModule } from './cdtpDiagnosticsModule';
import { Crdp } from '../..';
import { TargetToInternal } from './targetToInternal';

export class CDTPConsole extends CDTPEventsEmitterDiagnosticsModule<Crdp.ConsoleApi> {
    public readonly onMessageAdded = this.addApiListener('messageAdded', (params: Crdp.Console.MessageAddedEvent) => params);

    public enable(): Promise<void> {
        return this.api.enable();

    }
    constructor(protected api: Crdp.ConsoleApi) {
        super();
    }
}

export class CDTPSchema extends CDTPDiagnosticsModule<Crdp.SchemaApi> {
    public getDomains(): Promise<Crdp.Schema.GetDomainsResponse> {
        return this.api.getDomains();
    }

    constructor(protected api: Crdp.SchemaApi) {
        super();
    }
}

export class CDTPDOMDebugger extends CDTPDiagnosticsModule<Crdp.DOMDebuggerApi> {
    public setInstrumentationBreakpoint(params: Crdp.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
        return this.api.setInstrumentationBreakpoint(params);
    }

    public removeInstrumentationBreakpoint(params: Crdp.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
        return this.api.removeInstrumentationBreakpoint(params);
    }

    constructor(protected api: Crdp.DOMDebuggerApi) {
        super();
    }
}

export class CDTPPage extends CDTPEventsEmitterDiagnosticsModule<Crdp.PageApi> {
    public readonly onMessageAdded = this.addApiListener('frameNavigated', (params: Crdp.Page.FrameNavigatedEvent) => params);

    public enable(): Promise<void> {
        return this.api.enable();
    }

    public navigate(params: Crdp.Page.NavigateRequest): Promise<Crdp.Page.NavigateResponse> {
        return this.api.navigate(params);
    }

    public reload(params: Crdp.Page.ReloadRequest): Promise<void> {
        return this.api.reload(params);
    }

    constructor(protected api: Crdp.PageApi) {
        super();
    }
}

export class CDTPNetwork extends CDTPDiagnosticsModule<Crdp.NetworkApi> {
    public disable(): Promise<void> {
        return this.api.disable();
    }

    public enable(params: Crdp.Network.EnableRequest): Promise<void> {
        return this.api.enable(params);
    }

    public setCacheDisabled(params: Crdp.Network.SetCacheDisabledRequest): Promise<void> {
        return this.api.setCacheDisabled(params);
    }

    constructor(protected api: Crdp.NetworkApi) {
        super();
    }
}

export class CDTPBrowser extends CDTPDiagnosticsModule<Crdp.BrowserApi> {
    public getVersion(): Promise<Crdp.Browser.GetVersionResponse> {
        return this.api.getVersion();
    }

    constructor(protected api: Crdp.BrowserApi) {
        super();
    }
}

export class CDTPOverlay extends CDTPDiagnosticsModule<Crdp.OverlayApi> {
    public setPausedInDebuggerMessage(params: Crdp.Overlay.SetPausedInDebuggerMessageRequest): Promise<void> {
        return this.api.setPausedInDebuggerMessage(params);
    }

    constructor(protected api: Crdp.OverlayApi) {
        super();
    }
}

export class CDTPLog extends CDTPEventsEmitterDiagnosticsModule<Crdp.LogApi> {
    public readonly onEntryAdded = this.addApiListener('entryAdded', async (params: Crdp.Log.EntryAddedEvent) => await this._crdpToInternal.toLogEntry(params.entry));

    public enable(): Promise<void> {
        return this.api.enable();
    }

    constructor(protected readonly api: Crdp.LogApi, private readonly _crdpToInternal: TargetToInternal) {
        super();
    }
}
