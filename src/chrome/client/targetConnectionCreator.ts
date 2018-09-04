import { StepProgressEventsEmitter } from '../../executionTimingsReporter';

import { utils, ChromeDebugLogic, ICommonRequestArgs, ChromeDebugAdapter, ChromeDebugSession, LineColTransformer } from '../..';

import { InitializedEvent, logger } from 'vscode-debugadapter';
import { CDTPDiagnostics, registerCDTPDiagnosticsPublishersAndHandlers } from '../target/cdtpDiagnostics';
import { ChromeConnection } from '../chromeConnection';
import { telemetry } from '../../telemetry';
import { BreakOnLoadHelper } from '../breakOnLoadHelper';
import { IChromeDebugAdapterOpts } from '../chromeDebugSession';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { ClientToInternal } from './clientToInternal';
import { InternalToClient } from './internalToClient';
import { StackTracesLogic, StackTraceDependencies } from '../internal/stackTraces/stackTracesLogic';
import { SkipFilesLogic, ISkipFilesLogicDependencies } from '../internal/features/skipFiles';
import { BreakpointsLogic, BreakpointsLogicDependencies } from '../internal/breakpoints/breakpointsLogic';
import { LoggingCommunicator, Communicator } from '../communication/communicator';
import { ExecutionLogger } from '../logging/executionLogger';
import { Internal } from '../communication/internalChannels';
import { Client } from '../communication/clientChannels';
import { Target } from '../communication/targetChannels';
import { EagerSourceMapTransformer } from '../../transformers/eagerSourceMapTransformer';
import { RemotePathTransformer } from '../../transformers/remotePathTransformer';
import { CDTPScriptsRegistry } from '../target/cdtpScriptsRegistry';
import { DelayMessagesUntilInitializedSession } from './delayMessagesUntilInitializedSession';
import { DoNotPauseWhileSteppingSession } from './doNotPauseWhileSteppingSession';
import { ILoadedSource } from '../internal/sources/loadedSource';
import { asyncMap } from '../collections/async';
import { PauseOnExceptionDependencies, PauseOnExceptionOrRejection } from '../internal/exceptions/pauseOnException';
import { SteppingDependencies, Stepping } from '../internal/stepping/stepping';
import { TakeProperActionOnPausedEventDependencies, TakeProperActionOnPausedEvent } from '../internal/features/takeProperActionOnPausedEvent';
import { IDotScriptCommandDependencies, DotScriptCommand } from '../internal/sources/features/dotScriptsCommand';
import { HandlesRegistry } from './handlesRegistry';
import { EventSender } from './eventSender';
import { SmartStepLogic } from '../internal/features/smartStep';
import { IExtensibilityPoints } from '../extensibility/extensibilityPoints';

export class TargetConnectionConfigurator {
    public readonly events: StepProgressEventsEmitter;

    public async configure(): Promise<void> {

        /* __GDPR__FRAGMENT__
        "StepNames" : {
            "Attach.ConfigureDebuggingSession.Internal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
         }
        */
        this.events.emitStepStarted('Attach.ConfigureDebuggingSession.Internal');

        // TODO DIEGO: We need to make sure that we have event listeners at this point

        /* __GDPR__FRAGMENT__
           "StepNames" : {
              "Attach.ConfigureDebuggingSession.Target" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
           }
         */
        this.events.emitStepStarted('Attach.ConfigureDebuggingSession.Target');

        // Make sure debugging domain is enabled before calling refreshBlackboxPatterns() below
        await Promise.all(this.runConnection());

        await this.initSupportedDomains();

        doesTargetSupportColumnBreakpoints().then(() => this._chromeDebugAdapter.sendInitializedEvent()); // Do not wait for this. This will finish after we get the first script loaded event
    }

    /**
     * Enable clients and run connection
     */
    public runConnection(): Promise<void>[] {
        return [
            utils.toVoidP(this.chrome.Debugger.enable()),
            this.chrome.Runtime.enable(),
            this.chrome.Log.enable()
                .catch(_e => { }), // Not supported by all runtimes
            this._chromeConnection.run(),
        ];
    }

    private async initSupportedDomains(): Promise<void> {
        try {
            const domainResponse = await this.chrome.Schema.getDomains();
            domainResponse.domains.forEach(domain => this._domains.set(<any>domain.name, domain));
        } catch (e) {
            // If getDomains isn't supported for some reason, skip this
        }
    }

    /**
     * This event tells the client to begin sending setBP requests, etc. Some consumers need to override this
     * to send it at a later time of their choosing.
     */
    public async sendInitializedEvent(): Promise<void> {
        await this._breakpointsLogic.detectColumnBreakpointSupport();

        // Wait to finish loading sourcemaps from the initial scriptParsed events
        // TODO DIEGO: Why is this neccesary?
        // if (this._initialSourceMapsP) {
        //     const initialSourceMapsP = this._initialSourceMapsP;
        //     this._initialSourceMapsP = null;

        //     await initialSourceMapsP;

        this._session.sendEvent(new InitializedEvent());
        this.events.emitStepCompleted('NotifyInitialized');
    }

    constructor(
        private readonly _chromeConnection: ChromeConnection,
        private readonly chrome: CDTPDiagnostics, ) { }
}

export enum ScenarioType {
    Launch,
    Attach
}

export class ScenarioParametersConfigurator {
    public configure(): void {
        const port = this._args.port || 9229;

        this._subclass.commonArgs(this._args);

        if (this._args.pathMapping) {
            for (const urlToMap in this._args.pathMapping) {
                this._args.pathMapping[urlToMap] = utils.canonicalizeUrl(this._args.pathMapping[urlToMap]);
            }
        }

        this.sourceMapTransformer.launch(this._args);
    this._pathTransformer.launch(this._args);

    if(this._args.breakOnLoadStrategy && this._args.breakOnLoadStrategy !== 'off') {
        this._breakOnLoadHelper = new BreakOnLoadHelper(this, this._args.breakOnLoadStrategy, this._breakpointsLogic);
        }

if (!this._args.__restart) {
            telemetry.reportEvent('debugStarted', { request: 'launch', args: Object.keys(this._args) });
}

        telemetry.reportEvent('debugStarted', { request: this._scenarioType.toString(), args: Object.keys(this._args) });
    }

    constructor(
        private readonly _subclass: ChromeDebugAdapter,
private readonly _chromeConnection: ChromeConnection,
    private readonly _scenarioType: ScenarioType,
private readonly _args: ICommonRequestArgs) { }
}

export class ModelCreator {
    public _chromeDebugAdapter: ChromeDebugLogic;
    public _lineColTransformer: LineColTransformer;
    public _sourcesLogic: SourcesLogic;
    public _scriptLogic: ScriptsRegistry;
    public _clientToInternal: ClientToInternal;
    public _internalToVsCode: InternalToClient;
    public _stackTraceLogic: StackTracesLogic;
    public _skipFilesLogic: SkipFilesLogic;
    public _breakpointsLogic: BreakpointsLogic;

    public async create(args: IChromeDebugAdapterOpts, originalSession: ChromeDebugSession, chromeConnection: ChromeConnection): Promise<ConnectedCDA> {
        const communicator = new LoggingCommunicator(new Communicator(), new ExecutionLogger(logger));

        const chromeConnection = new (args.chromeConnection || ChromeConnection)(undefined, args.targetFilter);

        const addBreakpointForLoadedSource = communicator.getRequester(Internal.Breakpoints.AddBreakpointForLoadedSource);
        const sendClientBPStatusChanged = communicator.getRequester(Client.EventSender.SendBPStatusChanged);
        const setInstrumentationBreakpoint = communicator.getRequester(Target.Debugger.SetInstrumentationBreakpoint);
        const removeInstrumentationBreakpoint = communicator.getRequester(Target.Debugger.RemoveInstrumentationBreakpoint);

        const sourceMapTransformer = new (args.sourceMapTransformer || EagerSourceMapTransformer)(args.enableSourceMapCaching);
        const pathTransformer = new (args.pathTransformer || RemotePathTransformer)();
        this._scriptsLogic = new CDTPScriptsRegistry();
        const chromeDiagnostics = new CDTPDiagnostics(chromeConnection.api, pathTransformer, sourceMapTransformer);
        await registerCDTPDiagnosticsPublishersAndHandlers(communicator, chromeDiagnostics);

        const session = new DelayMessagesUntilInitializedSession(new DoNotPauseWhileSteppingSession(originalSession));

        this._lineColTransformer = new (args.lineColTransformer || LineColTransformer)(session);

        const doesTargetSupportColumnBreakpoints = communicator.getRequester(Target.Debugger.SupportsColumnBreakpoints);
        const onLoadedSourceIsAvailable = (listener: (source: ILoadedSource) => void) => {
            communicator.subscribe(Target.Debugger.OnScriptParsed, async scriptParsed => {
                await asyncMap(scriptParsed.script.allSources, listener);
            });
        };

        const dependencies: BreakpointsLogicDependencies & PauseOnExceptionDependencies & SteppingDependencies
            & StackTraceDependencies & TakeProperActionOnPausedEventDependencies & ISkipFilesLogicDependencies
            & IDotScriptCommandDependencies = {
            addBreakpointForLoadedSource: addBreakpointForLoadedSource,
            sendClientBPStatusChanged: sendClientBPStatusChanged,
            sendOutputToClient: communicator.getRequester(Client.EventSender.SendOutput),

            setInstrumentationBreakpoint: setInstrumentationBreakpoint,
            removeInstrumentationBreakpoint: removeInstrumentationBreakpoint,
            doesTargetSupportColumnBreakpoints: doesTargetSupportColumnBreakpoints,
            sendBPStatusChanged: communicator.getRequester(Client.EventSender.SendBPStatusChanged),
            getPossibleBreakpoints: communicator.getRequester(Target.Debugger.GetPossibleBreakpoints),
            onAsyncBreakpointResolved: communicator.getSubscriber(Target.Debugger.OnAsyncBreakpointResolved),
            askForInformationAboutPaused: communicator.getSubscriber(Internal.AskForInformationAboutPaused),
            removeBreakpoint: communicator.getRequester(Target.Debugger.RemoveBreakpoint),
            setBreakpoint: communicator.getRequester(Target.Debugger.SetBreakpoint),
            setBreakpointByUrl: communicator.getRequester(Target.Debugger.SetBreakpointByUrl),
            setBreakpointByUrlRegexp: communicator.getRequester(Target.Debugger.SetBreakpointByUrlRegexp),
            onResumed: communicator.getSubscriber(Target.Debugger.OnResumed),
            onPaused: communicator.getSubscriber(Target.Debugger.OnPaused),
            setPauseOnExceptions: communicator.getRequester(Target.Debugger.SetPauseOnExceptions),
            onLoadedSourceIsAvailable: onLoadedSourceIsAvailable,
            pauseProgramOnAsyncCall: communicator.getRequester(Target.Debugger.PauseOnAsyncCall),
            notifyNoPendingBPs: communicator.getPublisher(Internal.Breakpoints.OnNoPendingBreakpoints),
            notifyClientDebugeeIsStopped: communicator.getRequester(Client.EventSender.SendDebugeeIsStopped),
            resumeProgram: communicator.getRequester(Target.Debugger.Resume),
            askForInformationAboutPause: communicator.getPublisher(Internal.Breakpoints.AskForInformationAboutPaused),

            // Stepping
            stepOverDebugee: communicator.getRequester(Target.Debugger.StepOver),
            pauseDebugee: communicator.getRequester(Target.Debugger.Pause),
            resumeDebugee: communicator.getRequester(Target.Debugger.Resume),
            restartFrameInDebugee: async params => { await communicator.getRequester(Target.Debugger.RestartFrame)(params); }, // We discard the result
            stepIntoDebugee: communicator.getRequester(Target.Debugger.StepInto),
            stepOutInDebugee: communicator.getRequester(Target.Debugger.StepOut),
            allSourcePathDetails: path => sourceMapTransformer.allSourcePathDetails(path),

            allScripts: () => Promise.all(Array.from(this._scriptsLogic.getAllScripts())),
            getScriptByUrl: path => this._scriptsLogic.getScriptsByPath(path),
            getScriptSource: script => this._sourcesLogic.getScriptText(script),

            onScriptParsed: communicator.getSubscriber(Target.Debugger.OnScriptParsed),

            getScriptsByUrl: url => this._scriptsLogic.getScriptsByPath(url)
        };

        // TODO DIEGO: this._breakpointsLogic = BreakpointsLogic.createWithHandlers(communicator, dependencies, args.breakOnLoadStrategy && args.breakOnLoadStrategy !== 'off');
        this._breakpointsLogic = BreakpointsLogic.createWithHandlers(communicator, dependencies, true);

        this._stepping = new Stepping(dependencies).install();
        this._pauseOnException = new PauseOnExceptionOrRejection(dependencies).install();

        this._sourcesLogic = new SourcesLogic(chromeDiagnostics, this._scriptsLogic);
        const handlesRegistry = new HandlesRegistry();
        this._clientToInternal = new ClientToInternal(handlesRegistry, this._lineColTransformer, this._sourcesLogic);

        this._internalToVsCode = new InternalToClient(handlesRegistry, this._lineColTransformer);

        const eventSender = EventSender.createWithHandlers(communicator, session, this._internalToVsCode);

        this._skipFilesLogic = new SkipFilesLogic(dependencies, this._scriptsLogic, chromeDiagnostics,
            this._stackTraceLogic, sourceMapTransformer, pathTransformer);
        const smartStepLogic = new SmartStepLogic(dependencies, pathTransformer, sourceMapTransformer, false);
        new TakeProperActionOnPausedEvent(dependencies).install();
        this._stackTraceLogic = new StackTracesLogic(dependencies, this._skipFilesLogic, smartStepLogic).install();
        this._dotScriptCommand = new DotScriptCommand(dependencies);

        this._chromeDebugAdapter = new ChromeDebugLogic(this._lineColTransformer, sourceMapTransformer, pathTransformer, session,
            this._scriptsLogic, chromeConnection, chromeDiagnostics, smartStepLogic, eventSender).install();


        return new ConnectedCDA({});
    }


    constructor(
        private readonly _subclass: IExtensibilityPoints,
        private readonly _chromeConnection: ChromeConnection,
        private readonly _scenarioType: ScenarioType,
        private readonly _args: ICommonRequestArgs) { }
}