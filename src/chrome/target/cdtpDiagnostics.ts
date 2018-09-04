import { Crdp, BasePathTransformer, BaseSourceMapTransformer } from '../..';
import { RuntimeScriptsManager } from './runtimeScriptsManager';
import { IScript } from '../internal/script';
import { TargetToInternal } from './targetToInternal';
import { CallFrame } from '../internal/stackTraces';
import { InternalToTarget } from './internalToTarget';
import { CDTPDebugger } from './cdtpDebugger';
import { ValidatedMap } from '../collections/validatedMap';
import { CDTPConsole, CDTPSchema, CDTPDOMDebugger, CDTPPage, CDTPNetwork, CDTPBrowser, CDTPOverlay, CDTPLog } from './cdtpSmallerModules';
import { CDTPRuntime } from './cdtpRuntime';
import { Communicator } from '../communication/communicator';
import { Target } from '../communication/targetChannels';
import { BreakpointIdRegistry } from './breakpointIdRegistry';

export class CDTPDiagnostics {
    public Debugger: CDTPDebugger;
    public Console: CDTPConsole;
    public Runtime: CDTPRuntime;
    public Schema: CDTPSchema;
    public DOMDebugger: CDTPDOMDebugger;
    public Page: CDTPPage;
    public Network: CDTPNetwork;
    public Browser: CDTPBrowser;
    public Overlay: CDTPOverlay;
    public Log: CDTPLog;

    constructor(private _api: () => Crdp.ProtocolApi, runtimeScriptsManager: RuntimeScriptsManager,
        pathTransformer: BasePathTransformer, sourceMapTransformer: BaseSourceMapTransformer) {
        const breakpointIdRegistry = new BreakpointIdRegistry();
        const crdpToInternal = new TargetToInternal(runtimeScriptsManager, pathTransformer, sourceMapTransformer, breakpointIdRegistry);
        const internalToCRDP = new InternalToTarget(runtimeScriptsManager, new ValidatedMap<CallFrame<IScript>, Crdp.Debugger.CallFrameId>(), breakpointIdRegistry);
        this.Debugger = new CDTPDebugger(() => this._api().Debugger, crdpToInternal, internalToCRDP);
        this.Console = new CDTPConsole(() => this._api().Console);
        this.Runtime = new CDTPRuntime(() => this._api().Runtime, crdpToInternal);
        this.Schema = new CDTPSchema(() => this._api().Schema);
        this.DOMDebugger = new CDTPDOMDebugger(() => this._api().DOMDebugger);
        this.Page = new CDTPPage(() => this._api().Page);
        this.Network = new CDTPNetwork(() => this._api().Network);
        this.Browser = new CDTPBrowser(() => this._api().Browser);
        this.Overlay = new CDTPOverlay(() => this._api().Overlay);
        this.Log = new CDTPLog(() => this._api().Log, crdpToInternal);
    }
}

export function registerCDTPDiagnosticsPublishersAndHandlers(communicator: Communicator, cdtpDiagnostics: CDTPDiagnostics): void {
    const Debugger = Target.Debugger;

    // Notifications
    cdtpDiagnostics.Debugger.onBreakpointResolved(communicator.getPublisher(Debugger.OnAsyncBreakpointResolved));
    cdtpDiagnostics.Debugger.onScriptParsed(communicator.getPublisher(Debugger.OnScriptParsed));

    // Requests
    communicator.registerHandler(Debugger.RemoveBreakpoint, bpRecipie => cdtpDiagnostics.Debugger.removeBreakpoint(bpRecipie));
    communicator.registerHandler(Debugger.Resume, () => cdtpDiagnostics.Debugger.resume());
    communicator.registerHandler(Debugger.SetBreakpoint, bpRecipie => cdtpDiagnostics.Debugger.setBreakpoint(bpRecipie));
    communicator.registerHandler(Debugger.SetBreakpointByUrl, bpRecipie => cdtpDiagnostics.Debugger.setBreakpointByUrl(bpRecipie));
    communicator.registerHandler(Debugger.SetBreakpointByUrlRegexp, bpRecipie => cdtpDiagnostics.Debugger.setBreakpointByUrlRegexp(bpRecipie));
    communicator.registerHandler(Debugger.SupportsColumnBreakpoints, () => cdtpDiagnostics.Debugger.supportsColumnBreakpoints());
}