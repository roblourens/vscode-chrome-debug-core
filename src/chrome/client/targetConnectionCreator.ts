import { utils, ChromeDebugLogic, LineColTransformer, IClientCapabilities, ILaunchRequestArgs, IAttachRequestArgs, ChromeDebugSession, BaseSourceMapTransformer } from '../..';

import * as errors from '../../errors';

import { CDTPDiagnostics, registerCDTPDiagnosticsPublishersAndHandlers } from '../target/cdtpDiagnostics';
import { ChromeConnection } from '../chromeConnection';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { ClientToInternal } from './clientToInternal';
import { InternalToClient } from './internalToClient';
import { StackTracesLogic, StackTraceDependencies } from '../internal/stackTraces/stackTracesLogic';
import { SkipFilesLogic, ISkipFilesLogicDependencies } from '../internal/features/skipFiles';
import { BreakpointsLogic, BreakpointsLogicDependencies } from '../internal/breakpoints/breakpointsLogic';
import { LoggingCommunicator, Communicator, ICommunicator } from '../communication/communicator';
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
import { ConnectedCDA, ConnectedCDADependencies } from './chromeDebugAdapter/connectedCDA';
import { FallbackToClientPathTransformer } from '../../transformers/fallbackToClientPathTransformer';
import { LoggingConfiguration, Logging } from '../internal/services/logging';

export enum ScenarioType {
    Launch,
    Attach
}

export interface Dependencies extends BreakpointsLogicDependencies, PauseOnExceptionDependencies, SteppingDependencies,
    StackTraceDependencies, TakeProperActionOnPausedEventDependencies, ISkipFilesLogicDependencies, IDotScriptCommandDependencies { }

export class DependenciesCreator {
    constructor(
        private readonly communicator: ICommunicator,
        private readonly _chromeDiagnostics: CDTPDiagnostics,
        private readonly _scriptsLogic: CDTPScriptsRegistry,
        private readonly _sourceMapTransformer: BaseSourceMapTransformer) { }
    public create(): Dependencies {
        const onLoadedSourceIsAvailable = (listener: (source: ILoadedSource) => void) => {
            this.communicator.subscribe(Target.Debugger.OnScriptParsed, async scriptParsed => {
                await asyncMap(scriptParsed.script.allSources, listener);
            });
        };

        return {
            onLoadedSourceIsAvailable: onLoadedSourceIsAvailable,

            addBreakpointForLoadedSource: this.communicator.getRequester(Internal.Breakpoints.AddBreakpointForLoadedSource),
            sendClientBPStatusChanged: this.communicator.getRequester(Client.EventSender.SendBPStatusChanged),
            sendOutputToClient: this.communicator.getRequester(Client.EventSender.SendOutput),

            setInstrumentationBreakpoint: this.communicator.getRequester(Target.Debugger.SetInstrumentationBreakpoint),
            removeInstrumentationBreakpoint: this.communicator.getRequester(Target.Debugger.RemoveInstrumentationBreakpoint),
            sendBPStatusChanged: this.communicator.getRequester(Client.EventSender.SendBPStatusChanged),
            getPossibleBreakpoints: this.communicator.getRequester(Target.Debugger.GetPossibleBreakpoints),
            removeBreakpoint: this.communicator.getRequester(Target.Debugger.RemoveBreakpoint),
            setBreakpoint: this.communicator.getRequester(Target.Debugger.SetBreakpoint),
            setBreakpointByUrl: this.communicator.getRequester(Target.Debugger.SetBreakpointByUrl),
            setBreakpointByUrlRegexp: this.communicator.getRequester(Target.Debugger.SetBreakpointByUrlRegexp),
            setPauseOnExceptions: this.communicator.getRequester(Target.Debugger.SetPauseOnExceptions),
            pauseProgramOnAsyncCall: this.communicator.getRequester(Target.Debugger.PauseOnAsyncCall),
            notifyNoPendingBPs: this.communicator.getPublisher(Internal.Breakpoints.OnNoPendingBreakpoints),
            notifyClientDebugeeIsStopped: this.communicator.getRequester(Client.EventSender.SendDebugeeIsStopped),
            resumeProgram: this.communicator.getRequester(Target.Debugger.Resume),
            askForInformationAboutPause: this.communicator.getPublisher(Internal.Breakpoints.VoteForWhatToDoOnPaused),

            doesTargetSupportColumnBreakpoints: this.communicator.getRequester(Target.Debugger.SupportsColumnBreakpoints),

            onResumed: this.communicator.getSubscriber(Target.Debugger.OnResumed),
            onPaused: this.communicator.getSubscriber(Target.Debugger.OnPaused),
            onAsyncBreakpointResolved: this.communicator.getSubscriber(Target.Debugger.OnAsyncBreakpointResolved),
            subscriberForAskForInformationAboutPaused: this.communicator.getSubscriber(Internal.AskForInformationAboutPaused),
            listenToCallFrameAdditionalPresentationDetailsElection: this.communicator.getSubscriber(Internal.CallFrameAdditionalPresentationDetailsElection),
            publishCallFrameAdditionalPresentationDetailsElection: this.communicator.getPublisher(Internal.CallFrameAdditionalPresentationDetailsElection),

            // Stepping
            stepOverDebugee: this.communicator.getRequester(Target.Debugger.StepOver),
            pauseDebugee: this.communicator.getRequester(Target.Debugger.Pause),
            resumeDebugee: this.communicator.getRequester(Target.Debugger.Resume),
            restartFrameInDebugee: async params => { await this.communicator.getRequester(Target.Debugger.RestartFrame)(params); }, // We discard the result
            stepIntoDebugee: this.communicator.getRequester(Target.Debugger.StepInto),
            stepOutInDebugee: this.communicator.getRequester(Target.Debugger.StepOut),
            allSourcePathDetails: path => this._sourceMapTransformer.allSourcePathDetails(path),

            allScripts: () => Promise.all(Array.from(this._scriptsLogic.getAllScripts())),
            getScriptByUrl: path => this._scriptsLogic.getScriptsByPath(path),
            getScriptSource: this.communicator.getRequester(Target.Debugger.GetScriptSource),

            onScriptParsed: this.communicator.getSubscriber(Target.Debugger.OnScriptParsed),

            getScriptsByUrl: url => this._scriptsLogic.getScriptsByPath(url),

            setAsyncCallStackDepth: this.communicator.getRequester(Target.Debugger.SetAsyncCallStackDepth),

            // Temporary components until we remove them with the factoring
            chrome: this._chromeDiagnostics,
            // scriptsLogic: this._scriptsLogic,
        };
    }
}

export class ConnectedCDACreator {

    private initialization() {

        if (this._clientCapabilities.pathFormat !== 'path') {
            throw errors.pathFormat();
        }

        // because session bypasses dispatchRequest
        if (typeof this._clientCapabilities.linesStartAt1 === 'boolean') {
            (<any>this)._clientLinesStartAt1 = this._clientCapabilities.linesStartAt1;
        }

        if (typeof this._clientCapabilities.columnsStartAt1 === 'boolean') {
            (<any>this)._clientColumnsStartAt1 = this._clientCapabilities.columnsStartAt1;
        }
    }

    public async create(): Promise<ConnectedCDA> {
        const logging = new Logging().install(this._loggingConfiguration);
        const updateArguments = this._extensibilityPoints.updateArguments(this._args);

        if (updateArguments.pathMapping) {
            for (const urlToMap in updateArguments.pathMapping) {
                updateArguments.pathMapping[urlToMap] = utils.canonicalizeUrl(updateArguments.pathMapping[urlToMap]);
            }
        }

        const pathTransformer = this._clientCapabilities.supportsMapURLToFilePathRequest
            ? new FallbackToClientPathTransformer(this._session)
            : new (this._extensibilityPoints.pathTransformer || RemotePathTransformer)();
        pathTransformer.launch(updateArguments);

        const isVSClient = this._clientCapabilities.clientID === 'visualstudio';
        utils.setCaseSensitivePaths(!isVSClient); // TODO DIEGO: Find a way to remove this

        const sourceMapTransformer = new (this._extensibilityPoints.sourceMapTransformer || EagerSourceMapTransformer)(this._extensibilityPoints.enableSourceMapCaching);
        sourceMapTransformer.launch(updateArguments);
        sourceMapTransformer.isVSClient = isVSClient;

        const chromeConnection = new (this._chromeConnectionClass)(undefined, updateArguments.targetFilter || this._extensibilityPoints.targetFilter);
        const lineColTransformer = new (this._extensibilityPoints.lineColTransformer || LineColTransformer)(
            this._clientCapabilities.linesStartAt1,
            this._clientCapabilities.columnsStartAt1);

        this.initialization();

        const communicator = new LoggingCommunicator(new Communicator(), new ExecutionLogger(logging));

        const scriptsLogic = new CDTPScriptsRegistry();
        const chromeDiagnostics = new CDTPDiagnostics(chromeConnection.api, pathTransformer, sourceMapTransformer);
        await registerCDTPDiagnosticsPublishersAndHandlers(communicator, chromeDiagnostics);

        const session = new DelayMessagesUntilInitializedSession(new DoNotPauseWhileSteppingSession(this._session));
        const stackTraceLogic = await new StackTracesLogic(dependencies).install({ showAsyncStacks: updateArguments.showAsyncStacks });

        const dependencies: BreakpointsLogicDependencies & PauseOnExceptionDependencies & SteppingDependencies
            & StackTraceDependencies & TakeProperActionOnPausedEventDependencies & ISkipFilesLogicDependencies
            & IDotScriptCommandDependencies = new DependenciesCreator(
                communicator,
                chromeDiagnostics, scriptsLogic, sourceMapTransformer).create();

        const sourcesLogic = new SourcesLogic(dependencies);

        const handlesRegistry = new HandlesRegistry();
        const internalToVsCode = new InternalToClient(handlesRegistry, lineColTransformer);
        const eventSender = EventSender.createWithHandlers(communicator, session, internalToVsCode);
        new TakeProperActionOnPausedEvent(dependencies).install();
        const dotScriptCommand = new DotScriptCommand(dependencies);
        /*const smartStepLogic =*/ new SmartStepLogic(dependencies).install({ isEnabled: !!updateArguments.smartStep });
        // const supportedDomains = new SupportedDomains(dependencies).install();

        // TODO DIEGO: this._breakpointsLogic = BreakpointsLogic.createWithHandlers(communicator, dependencies, args.breakOnLoadStrategy && args.breakOnLoadStrategy !== 'off');
        const connectedCDADependencies: ConnectedCDADependencies = {
            lineColTransformer: lineColTransformer,
            scriptLogic: scriptsLogic,
            breakpointsLogic: BreakpointsLogic.createWithHandlers(communicator, dependencies, true),
            stepping: new Stepping(dependencies).install(),
            pauseOnException: new PauseOnExceptionOrRejection(dependencies).install(),

            sourcesLogic: sourcesLogic,
            clientToInternal: new ClientToInternal(handlesRegistry, lineColTransformer, sourcesLogic),
            stackTraceLogic: stackTraceLogic,

            internalToVsCode: internalToVsCode,
            dotScriptCommand: dotScriptCommand,
            skipFilesLogic: new SkipFilesLogic(dependencies),

            chromeDebugAdapter: new ChromeDebugLogic(lineColTransformer, sourceMapTransformer, pathTransformer, session,
                scriptsLogic, chromeConnection, chromeDiagnostics, eventSender).install(),
        };

        return new ConnectedCDA(connectedCDADependencies);
    }

    constructor(
        private readonly _extensibilityPoints: IExtensibilityPoints,
        private readonly _loggingConfiguration: LoggingConfiguration,
        private readonly _session: ChromeDebugSession,
        private readonly _clientCapabilities: IClientCapabilities,
        private readonly _chromeConnectionClass: typeof ChromeConnection,
        /* private readonly */ _scenarioType: ScenarioType,
        private readonly _args: ILaunchRequestArgs | IAttachRequestArgs) { }
}