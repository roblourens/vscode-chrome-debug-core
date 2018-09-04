import { Crdp, BasePathTransformer, BaseSourceMapTransformer } from '../..';
import { ScriptsRegistry } from '../internal/scripts/scriptsRegistry';
import { IScript } from '../internal/scripts/script';
import { TargetToInternal } from './targetToInternal';
import { InternalToTarget } from './internalToTarget';
import { CDTPDebugger } from './cdtpDebugger';
import { ValidatedMap } from '../collections/validatedMap';
import { CDTPConsole, CDTPSchema, CDTPDOMDebugger, CDTPPage, CDTPNetwork, CDTPBrowser, CDTPOverlay, CDTPLog } from './cdtpSmallerModules';
import { CDTPRuntime } from './cdtpRuntime';
import { Communicator } from '../communication/communicator';
import { Target } from '../communication/targetChannels';
import { BreakpointIdRegistry } from './breakpointIdRegistry';
import { CallFrame } from '../internal/stackTraces/callFrame';

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

    constructor(private _api: () => Crdp.ProtocolApi, scriptsRegistry: ScriptsRegistry,
        pathTransformer: BasePathTransformer, sourceMapTransformer: BaseSourceMapTransformer) {
        const breakpointIdRegistry = new BreakpointIdRegistry();
        const crdpToInternal = new TargetToInternal(scriptsRegistry, pathTransformer, sourceMapTransformer, breakpointIdRegistry);
        const internalToCRDP = new InternalToTarget(scriptsRegistry, new ValidatedMap<CallFrame<IScript>, Crdp.Debugger.CallFrameId>(), breakpointIdRegistry);
        this.Debugger = new CDTPDebugger(() => this._api().Debugger, crdpToInternal, internalToCRDP);
        this.Console = new CDTPConsole(() => this._api().Console);
        this.Runtime = new CDTPRuntime(() => this._api().Runtime, crdpToInternal, internalToCRDP);
        this.Runtime.on('executionContextCreated', params => scriptsRegistry.registerExecutionContext(params.context.id));
        this.Runtime.on('executionContextDestroyed', params => scriptsRegistry.markExecutionContextAsDestroyed(params.executionContextId));
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
    communicator.registerHandler(Debugger.GetPossibleBreakpoints, rangeInScript => cdtpDiagnostics.Debugger.getPossibleBreakpoints(rangeInScript));
    communicator.registerHandler(Debugger.RemoveBreakpoint, bpRecipie => cdtpDiagnostics.Debugger.removeBreakpoint(bpRecipie));
    communicator.registerHandler(Debugger.Resume, () => cdtpDiagnostics.Debugger.resume());
    communicator.registerHandler(Debugger.SetBreakpoint, bpRecipie => cdtpDiagnostics.Debugger.setBreakpoint(bpRecipie));
    communicator.registerHandler(Debugger.SetBreakpointByUrl, bpRecipie => cdtpDiagnostics.Debugger.setBreakpointByUrl(bpRecipie));
    communicator.registerHandler(Debugger.SetBreakpointByUrlRegexp, bpRecipie => cdtpDiagnostics.Debugger.setBreakpointByUrlRegexp(bpRecipie));
    communicator.registerHandler(Debugger.SupportsColumnBreakpoints, () => cdtpDiagnostics.Debugger.supportsColumnBreakpoints());
    communicator.registerHandler(Debugger.SetInstrumentationBreakpoint, eventName => cdtpDiagnostics.DOMDebugger.setInstrumentationBreakpoint({ eventName }));
    communicator.registerHandler(Debugger.RemoveInstrumentationBreakpoint, eventName => cdtpDiagnostics.DOMDebugger.removeInstrumentationBreakpoint({ eventName }));
}