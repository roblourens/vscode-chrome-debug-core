import { CDTPDiagnosticsModule } from './cdtpDiagnosticsModule';
import { Crdp } from '../..';
import { LogEntry } from './events';
import { TargetToInternal } from './targetToInternal';

export class CDTPConsole extends CDTPDiagnosticsModule<Crdp.ConsoleApi> {
    public on(event: 'messageAdded', listener: (params: Crdp.Console.MessageAddedEvent) => void): void {
        return this.api.on(event, listener);
    }

    public enable(): Promise<void> {
        return this.api.enable();
    }
}

export class CDTPSchema extends CDTPDiagnosticsModule<Crdp.SchemaApi> {
    public getDomains(): Promise<Crdp.Schema.GetDomainsResponse> {
        return this.api.getDomains();
    }
}

export class CDTPDOMDebugger extends CDTPDiagnosticsModule<Crdp.DOMDebuggerApi> {
    public setInstrumentationBreakpoint(params: Crdp.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
        return this.api.setInstrumentationBreakpoint(params);
    }

    public removeInstrumentationBreakpoint(params: Crdp.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
        return this.api.removeInstrumentationBreakpoint(params);
    }
}

export class CDTPPage extends CDTPDiagnosticsModule<Crdp.PageApi> {
    public enable(): Promise<void> {
        return this.api.enable();
    }

    public navigate(params: Crdp.Page.NavigateRequest): Promise<Crdp.Page.NavigateResponse> {
        return this.api.navigate(params);
    }

    public reload(params: Crdp.Page.ReloadRequest): Promise<void> {
        return this.api.reload(params);
    }

    public on(event: 'frameNavigated', listener: (params: Crdp.Page.FrameNavigatedEvent) => void): void {
        return this.api.on(event, listener);
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
}

export class CDTPBrowser extends CDTPDiagnosticsModule<Crdp.BrowserApi> {
    public getVersion(): Promise<Crdp.Browser.GetVersionResponse> {
        return this.api.getVersion();
    }
}

export class CDTPOverlay extends CDTPDiagnosticsModule<Crdp.OverlayApi> {
    public setPausedInDebuggerMessage(params: Crdp.Overlay.SetPausedInDebuggerMessageRequest): Promise<void> {
        return this.api.setPausedInDebuggerMessage(params);
    }
}

export class CDTPLog extends CDTPDiagnosticsModule<Crdp.LogApi> {
    public onEntryAdded(listener: (entry: LogEntry) => void): void {
        return this.api.on('entryAdded', async entryAdded => listener(await this._crdpToInternal.toLogEntry(entryAdded.entry)));
    }

    public enable(): Promise<void> {
        return this.api.enable();
    }

    constructor(apiGetter: () => Crdp.LogApi, private readonly _crdpToInternal: TargetToInternal) {
        super(apiGetter);
    }
}
