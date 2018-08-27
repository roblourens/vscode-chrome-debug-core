import { Crdp, utils, BasePathTransformer, BaseSourceMapTransformer } from '../..';
import { RuntimeScriptsManager } from './runtimeScriptsManager';
import Protocol from 'devtools-protocol';
import * as ChromeUtils from '../chromeUtils';
import { IRuntimeScript, RuntimeScript } from './runtimeScript';
import { IRuntimeScriptLocation } from './location';

export class ChromeDiagnostics {
    public Debugger: ChromeDebugger;
    public Console: ChromeConsole;
    public Runtime: ChromeRuntime;
    public Schema: ChromeSchema;
    public DOMDebugger: ChromeDOMDebugger;
    public Page: ChromePage;
    public Network: ChromeNetwork;
    public Browser: ChromeBrowser;
    public Overlay: ChromeOverlay;

    constructor(private _api: () => Crdp.ProtocolApi, runtimeScriptsManager: RuntimeScriptsManager,
        pathTransformer: BasePathTransformer, sourceMapTransformer: BaseSourceMapTransformer) {
        this.Debugger = new ChromeDebugger(() => this._api().Debugger, runtimeScriptsManager, pathTransformer, sourceMapTransformer);
        this.Console = new ChromeConsole(() => this._api().Console);
        this.Runtime = new ChromeRuntime(() => this._api().Runtime);
        this.Schema = new ChromeSchema(() => this._api().Schema);
        this.DOMDebugger = new ChromeDOMDebugger(() => this._api().DOMDebugger);
        this.Page = new ChromePage(() => this._api().Page);
        this.Network = new ChromeNetwork(() => this._api().Network);
        this.Browser = new ChromeBrowser(() => this._api().Browser);
        this.Overlay = new ChromeOverlay(() => this._api().Overlay);
    }
}

export abstract class ChromeModule<T> {
    private _api: T = null;

    protected get api(): T {
        if (this._api === null) {
            this._api = this._getModuleApi();
            this.onApiAvailable();
        }

        return this._api;
    }

    protected onApiAvailable(): void {
        // Subclasses can use this method to perform work after the API becomes available
    }

    constructor(private _getModuleApi: () => T) { }
}

export type onScriptParsedListener = (params: Crdp.Debugger.ScriptParsedEvent, runtimeScript: IRuntimeScript) => void;

export class ChromeDebugger extends ChromeModule<Crdp.DebuggerApi> {
    private _onScriptParsedListeners: onScriptParsedListener[] = [];
    private _firstScriptWasParsed = utils.promiseDefer<Crdp.Runtime.ScriptId>();

    public onBreakpointResolved(listener: (breakpointId: Crdp.Debugger.BreakpointId, location: IRuntimeScriptLocation) => void): void {
        return this.api.on('breakpointResolved', params => {
            listener(params.breakpointId, this.toRuntimeScriptLocation(params.location));
        });
    }

    public toRuntimeScriptLocation(location: Crdp.Debugger.Location): IRuntimeScriptLocation {
        return { lineNumber: location.lineNumber, columnNumber: location.columnNumber, runtimeScript: this._runtimeScriptsManager.getById(location.scriptId) };
    }

    public onScriptParsed(listener: onScriptParsedListener): void {
        this._onScriptParsedListeners.push(listener);
    }

    public onPaused(listener: (params: Crdp.Debugger.PausedEvent, topFrameLocationScript: IRuntimeScript) => void): void {
        return this.api.on('paused', params => {
            const topFrameLocationScript = params.callFrames ? this.getRuntimeScript(params.callFrames[0].location.scriptId) : null;
            listener(params, topFrameLocationScript);
        });
    }
    public on(event: 'resumed', listener: () => void): void;
    public on(event: 'scriptFailedToParse', listener: (params: Crdp.Debugger.ScriptFailedToParseEvent) => void): void;
    public on(event: | 'resumed' | 'scriptFailedToParse', listener: (params: any) => void): void {
        return this.api.on(event as any, listener);
    }

    public enable(): any {
        return this.api.enable();
    }
    public setAsyncCallStackDepth(arg0: { maxDepth: number; }): any {
        return this.api.setAsyncCallStackDepth(arg0);
    }
    public pauseOnAsyncCall(arg0: { parentStackTraceId: any; }): any {
        return this.api.pauseOnAsyncCall(arg0);
    }
    public resume(): any {
        return this.api.resume();
    }

    public getPossibleBreakpoints(params: { start: IRuntimeScriptLocation, end?: IRuntimeScriptLocation, restrictToFunction?: boolean }): Promise<Protocol.Debugger.GetPossibleBreakpointsResponse> {
        return this.api.getPossibleBreakpoints({
            start: this.toCrdpLocation(params.start),
            end: this.toCrdpLocation(params.end),
            restrictToFunction: params.restrictToFunction
        });
    }

    private toCrdpLocation(location: IRuntimeScriptLocation): Protocol.Debugger.Location {
        return {
            scriptId: this.getId(location.runtimeScript),
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber
        };
    }

    public setBlackboxedRanges(runtimeScript: IRuntimeScript, positions: Protocol.Debugger.ScriptPosition[]): Promise<void> {
        return this.api.setBlackboxedRanges({ scriptId: this.getId(runtimeScript), positions: positions });
    }
    public setBlackboxPatterns(arg0: { patterns: string[]; }): any {
        return this.api.setBlackboxPatterns(arg0);
    }
    public removeBreakpoint(arg0: { breakpointId: any; }): any {
        return this.api.removeBreakpoint(arg0);
    }
    public setBreakpoint(arg0: { location: { scriptId: any; lineNumber: number; columnNumber: number; }; condition: string; }): any {
        return this.api.setBreakpoint(arg0);
    }
    public setBreakpointByUrl(arg0: { urlRegex: string; lineNumber: number; columnNumber: number; condition?: string; }): any {
        return this.api.setBreakpointByUrl(arg0);
    }
    public setPauseOnExceptions(arg0: { state: 'all' | 'uncaught' | 'none'; }): any {
        return this.api.setPauseOnExceptions(arg0);
    }
    public stepOver(): any {
        return this.api.stepOver();
    }
    public stepInto(args: { breakOnAsyncCall?: boolean; }): any {
        return this.api.stepInto(args);
    }
    public stepOut(): any {
        return this.api.stepOut();
    }
    public pause(): any {
        return this.api.pause();
    }
    public async getScriptSource(runtimeScript: IRuntimeScript): Promise<string> {
        return (await this.api.getScriptSource({ scriptId: this._runtimeScriptsManager.getCrdpId(runtimeScript) })).scriptSource;
    }
    public evaluateOnCallFrame(args: any): any {
        return this.api.evaluateOnCallFrame(args);
    }
    public setVariableValue(arg0: { callFrameId: string; scopeNumber: number; variableName: string; newValue: any; }): any {
        return this.api.setVariableValue(arg0);
    }
    public restartFrame(arg0: { callFrameId: any; }): any {
        return this.api.restartFrame(arg0);
    }

    private getId(runtimeScript: IRuntimeScript): Crdp.Runtime.ScriptId {
        return this._runtimeScriptsManager.getCrdpId(runtimeScript);
    }

    public getRuntimeScript(scriptId: Crdp.Runtime.ScriptId): IRuntimeScript {
        return this._runtimeScriptsManager.getById(scriptId);
    }

    public async supportsColumnBreakpoints(): Promise<boolean> {
        const scriptId = await this._firstScriptWasParsed.promise;

        try {
            await this.api.getPossibleBreakpoints({
                start: { scriptId, lineNumber: 0, columnNumber: 0 },
                end: { scriptId, lineNumber: 1, columnNumber: 0 },
                restrictToFunction: false
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    protected onApiAvailable(): void {
        this.api.on('scriptParsed', async params => {
            if (!params.url) {
                params.url = ChromeUtils.EVAL_NAME_PREFIX + params.scriptId;
            }

            // Get mapped url and sources from the source maps
            const mappedUrl = await this._pathTransformer.scriptParsed(params.url);

            // TODO DIEGO: Convert to actual sources objects
            const sourceNamesOrLocations = await this._sourceMapTransformer.scriptParsed(mappedUrl, params.sourceMapURL) || [];

            const runtimeScript = new RuntimeScript(params.url, mappedUrl, sourceNamesOrLocations);

            this._runtimeScriptsManager.addNewRuntimeScript(params.scriptId, runtimeScript);
            this._onScriptParsedListeners.forEach(listener => listener(params, runtimeScript));

            // We resolve the promise waiting for the first script parse. This is used to detect column breakpoints support
            this._firstScriptWasParsed.resolve(params.scriptId);
        });
    }

    constructor(apiGetter: () => Crdp.DebuggerApi, private _runtimeScriptsManager: RuntimeScriptsManager,
        private _pathTransformer: BasePathTransformer, private _sourceMapTransformer: BaseSourceMapTransformer) {
        super(apiGetter);
    }
}

export class ChromeConsole extends ChromeModule<Crdp.ConsoleApi> {
    public on(event: 'messageAdded', listener: (params: Crdp.Console.MessageAddedEvent) => void): void {
        return this.api.on(event, listener);
    }
    public enable(): any {
        return this.api.enable();
    }
}

type RuntimeListener = ((params: Crdp.Runtime.ConsoleAPICalledEvent) => void)
    | ((params: Crdp.Runtime.ExceptionThrownEvent) => void)
    | (() => void);

export class ChromeRuntime extends ChromeModule<Crdp.RuntimeApi> {
    public on(event: 'consoleAPICalled', listener: (params: Crdp.Runtime.ConsoleAPICalledEvent) => void): void;
    public on(event: 'exceptionThrown', listener: (params: Crdp.Runtime.ExceptionThrownEvent) => void): void;
    public on(event: 'executionContextsCleared', listener: () => void): void;
    on(event: 'executionContextDestroyed', listener: (params: Crdp.Runtime.ExecutionContextDestroyedEvent) => void): void;
    public on(event: 'consoleAPICalled' | 'exceptionThrown' | 'executionContextsCleared' | 'executionContextDestroyed', listener: RuntimeListener): void {
        return this.api.on(event as any, listener as any);
    }

    public enable(): any {
        return this.api.enable();
    }
    public callFunctionOn(params: Crdp.Runtime.CallFunctionOnRequest): Promise<Crdp.Runtime.CallFunctionOnResponse> {
        return this.api.callFunctionOn(params);
    }
    public getProperties(params: any): any {
        return this.api.getProperties(params);
    }
    public evaluate(args: any): any {
        return this.api.evaluate(args);
    }
}

export class ChromeSchema extends ChromeModule<Crdp.SchemaApi> {
    public getDomains() {
        return this.api.getDomains();
    }
}

export class ChromeDOMDebugger extends ChromeModule<Crdp.DOMDebuggerApi> {
    public setInstrumentationBreakpoint(args: { eventName: 'scriptFirstStatement' }) {
        return this.api.setInstrumentationBreakpoint(args);
    }
}

export class ChromePage extends ChromeModule<Crdp.PageApi> {
    public enable() {
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

export class ChromeNetwork extends ChromeModule<Crdp.NetworkApi> {
    public disable() {
        return this.api.disable();
    }
    public enable(params: Crdp.Network.EnableRequest): Promise<void> {
        return this.api.enable(params);
    }
    public setCacheDisabled(params: Crdp.Network.SetCacheDisabledRequest): Promise<void> {
        return this.api.setCacheDisabled(params);
    }
}

export class ChromeBrowser extends ChromeModule<Crdp.BrowserApi> {
    public getVersion(): Promise<Crdp.Browser.GetVersionResponse> {
        return this.api.getVersion();
    }
}

export class ChromeOverlay extends ChromeModule<Crdp.OverlayApi> {
    public setPausedInDebuggerMessage(params: Crdp.Overlay.SetPausedInDebuggerMessageRequest): Promise<void> {
        return this.api.setPausedInDebuggerMessage(params);
    }
}
