import {
    IDebugAdapter, ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody,
    ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody,
    IEvaluateResponseBody, LineColTransformer, ICommonRequestArgs, IExceptionInfoResponseBody, utils
} from '../..';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ChromeDebugLogic } from '../chromeDebugAdapter';
import { IChromeDebugAdapterOpts, ChromeDebugSession } from '../chromeDebugSession';
import { ChromeConnection } from '../chromeConnection';
import { ScriptsRegistry } from '../internal/scripts/scriptsRegistry';
import { CDTPDiagnostics, registerCDTPDiagnosticsPublishersAndHandlers } from '../target/cdtpDiagnostics';
import { DelayMessagesUntilInitializedSession } from './delayMessagesUntilInitializedSession';
import { RemotePathTransformer } from '../../transformers/remotePathTransformer';
import { EagerSourceMapTransformer } from '../../transformers/eagerSourceMapTransformer';
import { StepProgressEventsEmitter } from '../../executionTimingsReporter';
import { ClientToInternal } from './clientToInternal';
import { InternalToClient } from './internalToClient';
import { IGetLoadedSourcesResponseBody } from '../../debugAdapterInterfaces';
import { StackTracesLogic, StackTraceDependencies } from '../internal/stackTraces/stackTracesLogic';
import { SkipFilesLogic, ISkipFilesLogicDependencies } from '../internal/features/skipFiles';
import { SmartStepLogic } from '../internal/features/smartStep';
import { EventSender } from './eventSender';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { BreakpointsLogic, BreakpointsLogicDependencies } from '../internal/breakpoints/breakpointsLogic';
import { Communicator, LoggingCommunicator } from '../communication/communicator';
import { HandlesRegistry } from './handlesRegistry';
import { Target } from '../communication/targetChannels';
import { Internal } from '../communication/internalChannels';
import { Client } from '../communication/clientChannels';
import { asyncMap } from '../collections/async';
import { ILoadedSource } from '../internal/sources/loadedSource';
import { Stepping, SteppingDependencies } from '../internal/stepping/stepping';
import * as errors from '../../errors';
import { PauseOnExceptionOrRejection, PauseOnExceptionDependencies } from '../internal/exceptions/pauseOnException';
import { ICallFrame } from '../internal/stackTraces/callFrame';
import { IScript } from '../internal/scripts/script';
import { DoNotPauseWhileSteppingSession } from './doNotPauseWhileSteppingSession';
import { TakeProperActionOnPausedEvent, TakeProperActionOnPausedEventDependencies } from '../internal/features/takeProperActionOnPausedEvent';
import { ExecutionLogger } from '../logging/executionLogger';
import { logger } from 'vscode-debugadapter';
import { DotScriptCommand, IDotScriptCommandDependencies } from '../internal/sources/features/dotScriptsCommand';

export class ChromeDebugAdapter implements IDebugAdapter {
    private static SCRIPTS_COMMAND = '.scripts';

    protected readonly _chromeDebugAdapter: ChromeDebugLogic;
    private readonly _lineColTransformer: LineColTransformer;
    private readonly _sourcesLogic: SourcesLogic;
    protected _scriptsLogic: ScriptsRegistry;
    protected readonly _clientToInternal: ClientToInternal;
    private readonly _internalToVsCode: InternalToClient;
    private readonly _stackTraceLogic: StackTracesLogic;
    private readonly _skipFilesLogic: SkipFilesLogic;
    protected readonly _breakpointsLogic: BreakpointsLogic;
    private readonly _pauseOnException: PauseOnExceptionOrRejection;
    private readonly _stepping: Stepping;
    private readonly _dotScriptCommand: DotScriptCommand;

    constructor(args: IChromeDebugAdapterOpts, originalSession: ChromeDebugSession) {
        const communicator = new LoggingCommunicator(new Communicator(), new ExecutionLogger(logger));

        const addBreakpointForLoadedSource = communicator.getRequester(Internal.Breakpoints.AddBreakpointForLoadedSource);
        const sendClientBPStatusChanged = communicator.getRequester(Client.EventSender.SendBPStatusChanged);
        const setInstrumentationBreakpoint = communicator.getRequester(Target.Debugger.SetInstrumentationBreakpoint);
        const removeInstrumentationBreakpoint = communicator.getRequester(Target.Debugger.RemoveInstrumentationBreakpoint);

        const sourceMapTransformer = new (args.sourceMapTransformer || EagerSourceMapTransformer)(args.enableSourceMapCaching);
        const pathTransformer = new (args.pathTransformer || RemotePathTransformer)();
        this._scriptsLogic = new ScriptsRegistry();
        const chromeDiagnostics = new CDTPDiagnostics(() => chromeConnection.api, this._scriptsLogic, pathTransformer, sourceMapTransformer);
        registerCDTPDiagnosticsPublishersAndHandlers(communicator, chromeDiagnostics);

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

        this._breakpointsLogic = BreakpointsLogic.createWithHandlers(communicator, dependencies);

        this._stepping = new Stepping(dependencies).install();
        this._pauseOnException = new PauseOnExceptionOrRejection(dependencies).install();

        this._sourcesLogic = new SourcesLogic(chromeDiagnostics, this._scriptsLogic);
        const handlesRegistry = new HandlesRegistry();
        this._clientToInternal = new ClientToInternal(handlesRegistry, this._lineColTransformer, this._sourcesLogic);

        const chromeConnection = new (args.chromeConnection || ChromeConnection)(undefined, args.targetFilter);

        this._internalToVsCode = new InternalToClient(handlesRegistry, this._lineColTransformer);

        const eventSender = EventSender.createWithHandlers(communicator, session, this._internalToVsCode);

        this._skipFilesLogic = new SkipFilesLogic(dependencies, this._scriptsLogic, chromeDiagnostics,
            this._stackTraceLogic, sourceMapTransformer, pathTransformer);
        const smartStepLogic = new SmartStepLogic(dependencies, pathTransformer, sourceMapTransformer, false);
        new TakeProperActionOnPausedEvent(dependencies).install();
        this._stackTraceLogic = new StackTracesLogic(dependencies, this._skipFilesLogic, smartStepLogic).install();
        this._dotScriptCommand = new DotScriptCommand(dependencies);

        this._chromeDebugAdapter = new ChromeDebugLogic(this._lineColTransformer, sourceMapTransformer, pathTransformer, session,
            this._scriptsLogic, chromeConnection, chromeDiagnostics,
            this._skipFilesLogic, smartStepLogic, eventSender, this._breakpointsLogic, this);

        doesTargetSupportColumnBreakpoints().then(() => this._chromeDebugAdapter.sendInitializedEvent()); // Do not wait for this. This will finish after we get the first script loaded event
    }

    public get events(): StepProgressEventsEmitter {
        return this._chromeDebugAdapter.events;
    }

    public get chrome(): CDTPDiagnostics {
        return this._chromeDebugAdapter.chrome;
    }

    public shutdown(): void {
        return this._chromeDebugAdapter.shutdown();
    }

    public initialize(args: DebugProtocol.InitializeRequestArguments, _?: ITelemetryPropertyCollector, _2?: number): DebugProtocol.Capabilities {
        return this._chromeDebugAdapter.initialize(args);
    }

    public launch(args: ILaunchRequestArgs, _?: ITelemetryPropertyCollector, _2?: number): Promise<void> {
        return this._chromeDebugAdapter.launch(args);
    }

    public attach(args: IAttachRequestArgs, _?: ITelemetryPropertyCollector, _2?: number): Promise<void> {
        return this._chromeDebugAdapter.attach(args);
    }

    public disconnect(_: DebugProtocol.DisconnectArguments): PromiseOrNot<void> {
        return this._chromeDebugAdapter.disconnect();
    }

    public async setBreakpoints(args: DebugProtocol.SetBreakpointsArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector): Promise<ISetBreakpointsResponseBody> {
        if (args.breakpoints) {
            const desiredBPRecipies = this._clientToInternal.toBPRecipies(args);
            const bpRecipiesStatus = await this._breakpointsLogic.setBreakpoints(desiredBPRecipies, telemetryPropertyCollector);
            return { breakpoints: await this._internalToVsCode.toBPRecipiesStatus(bpRecipiesStatus) };
        } else {
            throw new Error(`Expected the set breakpoints arguments to have a list of breakpoints yet it was ${args.breakpoints}`);
        }
    }

    public async setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments, _?: ITelemetryPropertyCollector, _2?: number): Promise<void> {
        const exceptionsStrategy = this._clientToInternal.toPauseOnExceptionsStrategy(args.filters);
        const promiseRejectionsStrategy = this._clientToInternal.toPauseOnPromiseRejectionsStrategy(args.filters);
        await this._pauseOnException.setExceptionsStrategy(exceptionsStrategy);
        this._pauseOnException.setPromiseRejectionStrategy(promiseRejectionsStrategy);
    }

    public configurationDone(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.configurationDone();
    }

    public continue(): PromiseOrNot<void> {
        return this._stepping.continue();
    }

    public next(): PromiseOrNot<void> {
        return this._stepping.next();
    }

    public stepIn(): PromiseOrNot<void> {
        return this._stepping.stepIn();
    }

    public stepOut(): PromiseOrNot<void> {
        return this._stepping.stepOut();
    }

    public pause(): PromiseOrNot<void> {
        return this._stepping.pause();
    }

    public async restartFrame(callFrame: ICallFrame<IScript>): Promise<void> {
        if (!callFrame) {
            return utils.errP(errors.noRestartFrame);
        }

        return this._stepping.restartFrame(callFrame);
    }

    public async stackTrace(args: DebugProtocol.StackTraceArguments, _?: ITelemetryPropertyCollector, _2?: number): Promise<IStackTraceResponseBody> {
        const stackTracePresentation = await this._stackTraceLogic.stackTrace(args);
        const clientStackTracePresentation = {
            stackFrames: await this._internalToVsCode.toStackFrames(stackTracePresentation.stackFrames),
            totalFrames: stackTracePresentation.totalFrames
        };
        return clientStackTracePresentation;
    }

    public scopes(args: DebugProtocol.ScopesArguments, _?: ITelemetryPropertyCollector, _2?: number): PromiseOrNot<IScopesResponseBody> {
        const frame = this._clientToInternal.getCallFrameById(args.frameId);
        if (frame.hasCallFrame()) {
            return this._chromeDebugAdapter.scopes(frame.callFrame);
        } else {
            const reason = frame.hasCodeFlow()
                ? 'a code flow frame only has code flow information'
                : 'a label frame is only a description of the different sections of the call stack';
            throw new Error(`Can't get scopes for the frame because ${reason}`);
        }
    }

    public variables(args: DebugProtocol.VariablesArguments, _?: ITelemetryPropertyCollector, _2?: number): PromiseOrNot<IVariablesResponseBody> {
        return this._chromeDebugAdapter.variables(args);
    }

    public async source(args: DebugProtocol.SourceArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<ISourceResponseBody> {
        if (args.source) {
            const source = this._clientToInternal.toSource(args.source);
            const sourceText = await this._sourcesLogic.getText(source);
            return {
                content: sourceText,
                mimeType: 'text/javascript'
            };
        } else {
            throw new Error(`Expected the source request to have a source argument yet it was ${args.source}`);
        }
    }

    public threads(): PromiseOrNot<IThreadsResponseBody> {
        return this._chromeDebugAdapter.threads();
    }

    public async evaluate(args: DebugProtocol.EvaluateArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<IEvaluateResponseBody> {
        if (args.expression.startsWith(ChromeDebugAdapter.SCRIPTS_COMMAND)) {
            const scriptsRest = utils.lstrip(args.expression, ChromeDebugAdapter.SCRIPTS_COMMAND).trim();
            await this._dotScriptCommand.handleScriptsCommand(scriptsRest);
            return <IEvaluateResponseBody>{
                result: '',
                variablesReference: 0
            };
        } else {
            return this._chromeDebugAdapter.evaluate(args);
        }
    }

    public async loadedSources(): Promise<IGetLoadedSourcesResponseBody> {
        return { sources: await this._internalToVsCode.toSourceTrees(await this._sourcesLogic.getLoadedSourcesTrees()) };
    }

    public setFunctionBreakpoints(_args: DebugProtocol.SetFunctionBreakpointsArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<DebugProtocol.SetFunctionBreakpointsResponse> {
        throw new Error('Method not implemented.');
    }

    public setVariable(_args: DebugProtocol.SetVariableArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<DebugProtocol.SetVariableResponse> {
        throw new Error('Method not implemented.');
    }

    public commonArgs(args: ICommonRequestArgs): void {
        return this._chromeDebugAdapter.commonArgs(args);
    }

    public async exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): Promise<IExceptionInfoResponseBody> {
        if (args.threadId !== ChromeDebugLogic.THREAD_ID) {
            throw errors.invalidThread(args.threadId);
        }

        return this._internalToVsCode.toExceptionInfo(await this._pauseOnException.latestExceptionInfo());
    }
}