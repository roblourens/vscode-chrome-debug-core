import { utils, LineColTransformer, IClientCapabilities, ILaunchRequestArgs, IAttachRequestArgs, ChromeDebugSession, BaseSourceMapTransformer } from '../..';

import * as errors from '../../errors';

import { CDTPDiagnostics, registerCDTPDiagnosticsPublishersAndHandlers } from '../target/cdtpDiagnostics';
import { ChromeConnection } from '../chromeConnection';
import { StackTraceDependencies } from '../internal/stackTraces/stackTracesLogic';
import { ISkipFilesLogicDependencies } from '../internal/features/skipFiles';
import { BreakpointsLogicDependencies } from '../internal/breakpoints/breakpointsLogic';
import { LoggingCommunicator, Communicator, ICommunicator } from '../communication/communicator';
import { ExecutionLogger } from '../logging/executionLogger';
import { Internal } from '../communication/internalChannels';
import { Client } from '../communication/clientChannels';
import { Target } from '../communication/targetChannels';
import { CDTPScriptsRegistry } from '../target/cdtpScriptsRegistry';
import { DelayMessagesUntilInitializedSession } from './delayMessagesUntilInitializedSession';
import { DoNotPauseWhileSteppingSession } from './doNotPauseWhileSteppingSession';
import { ILoadedSource } from '../internal/sources/loadedSource';
import { asyncMap } from '../collections/async';
import { PauseOnExceptionDependencies } from '../internal/exceptions/pauseOnException';
import { SteppingDependencies } from '../internal/stepping/stepping';
import { TakeProperActionOnPausedEventDependencies } from '../internal/features/takeProperActionOnPausedEvent';
import { IDotScriptCommandDependencies } from '../internal/sources/features/dotScriptsCommand';
import { IExtensibilityPoints } from '../extensibility/extensibilityPoints';
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
            sendClientBPStatusChanged: this.communicator.getRequester(Client.EventSender.SendBPStatusChanged),
            sendOutputToClient: this.communicator.getRequester(Client.EventSender.SendOutput),

            setInstrumentationBreakpoint: this.communicator.getRequester(Target.Debugger.SetInstrumentationBreakpoint),
            removeInstrumentationBreakpoint: this.communicator.getRequester(Target.Debugger.RemoveInstrumentationBreakpoint),
            sendBPStatusChanged: this.communicator.getRequester(Client.EventSender.SendBPStatusChanged),
            getPossibleBreakpoints: this.communicator.getRequester(Target.Debugger.GetPossibleBreakpoints),
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

    public create(): void {
        const logging = new Logging().install(this._loggingConfiguration);

        utils.setCaseSensitivePaths(this._clientCapabilities.clientID !== 'visualstudio'); // TODO DIEGO: Find a way to remove this

        this.initialization();

        const communicator = new LoggingCommunicator(new Communicator(), new ExecutionLogger(logging));

        const chromeDiagnostics = new CDTPDiagnostics(chromeConnection.api, pathTransformer, sourceMapTransformer);
        await registerCDTPDiagnosticsPublishersAndHandlers(communicator, chromeDiagnostics);
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