import {
    IDebugAdapter, ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody,
    ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody,
    IEvaluateResponseBody, LineColTransformer, ICommonRequestArgs, IExceptionInfoResponseBody
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
import { SkipFilesLogic } from '../internal/features/skipFiles';
import { SmartStepLogic } from '../internal/features/smartStep';
import { EventSender } from './eventSender';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { BreakpointsLogic, BreakpointsLogicDependencies } from '../internal/breakpoints/breakpointsLogic';
import { Communicator } from '../communication/communicator';
import { HandlesRegistry } from './handlesRegistry';
import { Target } from '../communication/targetChannels';
import { Internal } from '../communication/internalChannels';
import { Client } from '../communication/clientChannels';
import { asyncMap } from '../collections/async';
import { ILoadedSource } from '../internal/sources/loadedSource';
import { Stepping, SteppingDependencies } from '../internal/stepping/stepping';
import * as errors from '../../errors';
import { PauseOnException, PauseOnExceptionDependencies } from '../internal/features/pauseOnException';

export class ChromeDebugAdapter implements IDebugAdapter {
    protected readonly _chromeDebugAdapter: ChromeDebugLogic;
    private readonly _lineColTransformer: LineColTransformer;
    private readonly _sourcesLogic: SourcesLogic;
    protected _scriptsLogic: ScriptsRegistry;
    protected readonly _clientToInternal: ClientToInternal;
    private readonly _internalToVsCode: InternalToClient;
    private readonly _stackTraceLogic: StackTracesLogic;
    private readonly _skipFilesLogic: SkipFilesLogic;
    protected readonly _breakpointsLogic: BreakpointsLogic;
    private readonly _pauseOnException: PauseOnException;

    constructor(args: IChromeDebugAdapterOpts, originalSession: ChromeDebugSession) {
        const communicator = new Communicator();

        const addBreakpointForLoadedSource = communicator.getRequester(Internal.Breakpoints.AddBreakpointForLoadedSource);
        const sendClientBPStatusChanged = communicator.getRequester(Client.EventSender.SendBPStatusChanged);
        const setInstrumentationBreakpoint = communicator.getRequester(Target.Debugger.SetInstrumentationBreakpoint);
        const removeInstrumentationBreakpoint = communicator.getRequester(Target.Debugger.RemoveInstrumentationBreakpoint);

        const sourceMapTransformer = new (args.sourceMapTransformer || EagerSourceMapTransformer)(args.enableSourceMapCaching);
        const pathTransformer = new (args.pathTransformer || RemotePathTransformer)();
        this._scriptsLogic = new ScriptsRegistry();
        const chromeDiagnostics = new CDTPDiagnostics(() => chromeConnection.api, this._scriptsLogic, pathTransformer, sourceMapTransformer);
        registerCDTPDiagnosticsPublishersAndHandlers(communicator, chromeDiagnostics);

        const session = new DelayMessagesUntilInitializedSession(originalSession);

        this._lineColTransformer = new (args.lineColTransformer || LineColTransformer)(session);

        const doesTargetSupportColumnBreakpoints = communicator.getRequester(Target.Debugger.SupportsColumnBreakpoints);
        const onLoadedSourceIsAvailable = (listener: (source: ILoadedSource) => void) => {
            communicator.subscribe(Target.Debugger.OnScriptParsed, async scriptParsed => {
                await asyncMap(scriptParsed.script.allSources, listener);
            });
        };

        const dependencies: BreakpointsLogicDependencies & PauseOnExceptionDependencies & SteppingDependencies & StackTraceDependencies = {
            addBreakpointForLoadedSource: addBreakpointForLoadedSource,
            sendClientBPStatusChanged: sendClientBPStatusChanged,
            setInstrumentationBreakpoint: setInstrumentationBreakpoint,
            removeInstrumentationBreakpoint: removeInstrumentationBreakpoint,
            doesTargetSupportColumnBreakpoints: doesTargetSupportColumnBreakpoints,
            sendBPStatusChanged: communicator.getRequester(Client.EventSender.SendBPStatusChanged),
            getPossibleBreakpoints: communicator.getRequester(Target.Debugger.GetPossibleBreakpoints),
            onAsyncBreakpointResolved: communicator.getSubscriber(Target.Debugger.OnAsyncBreakpointResolved),
            onShouldPauseForUser: communicator.getSubscriber(Internal.OnShouldPauseForUser),
            removeBreakpoint: communicator.getRequester(Target.Debugger.RemoveBreakpoint),
            setBreakpoint: communicator.getRequester(Target.Debugger.SetBreakpoint),
            setBreakpointByUrl: communicator.getRequester(Target.Debugger.SetBreakpointByUrl),
            setBreakpointByUrlRegexp: communicator.getRequester(Target.Debugger.SetBreakpointByUrlRegexp),
            onResumed: communicator.getSubscriber(Target.Debugger.OnResumed),
            onLoadedSourceIsAvailable: onLoadedSourceIsAvailable,
            pauseProgramOnAsyncCall: communicator.getRequester(Target.Debugger.PauseOnAsyncCall),
            notifyNoPendingBPs: communicator.getPublisher(Internal.Breakpoints.OnNoPendingBreakpoints),
            getScriptsByUrl: url => this._scriptsLogic.getScriptsByPath(url)
        };

        this._breakpointsLogic = BreakpointsLogic.createWithHandlers(communicator, dependencies);

        new Stepping(dependencies).install();
        this._pauseOnException = new PauseOnException(dependencies).install();

        this._sourcesLogic = new SourcesLogic(chromeDiagnostics, this._scriptsLogic);
        const handlesRegistry = new HandlesRegistry();
        this._clientToInternal = new ClientToInternal(handlesRegistry, this._lineColTransformer, this._sourcesLogic);

        const chromeConnection = new (args.chromeConnection || ChromeConnection)(undefined, args.targetFilter);

        this._internalToVsCode = new InternalToClient(handlesRegistry, this._lineColTransformer);

        const eventSender = EventSender.createWithHandlers(communicator, session, this._internalToVsCode);

        this._skipFilesLogic = new SkipFilesLogic(this._scriptsLogic, chromeDiagnostics,
            this._stackTraceLogic, sourceMapTransformer, pathTransformer);
        const smartStepLogic = new SmartStepLogic(dependencies, pathTransformer, sourceMapTransformer, false);
        this._stackTraceLogic = new StackTracesLogic(dependencies, this._skipFilesLogic, smartStepLogic);

        this._chromeDebugAdapter = new ChromeDebugLogic(this._lineColTransformer, sourceMapTransformer, pathTransformer, session,
            this._scriptsLogic, this._sourcesLogic, chromeConnection, chromeDiagnostics,
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

    public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments, _?: ITelemetryPropertyCollector, _2?: number): PromiseOrNot<void> {
        return this._chromeDebugAdapter.setExceptionBreakpoints(args);
    }

    public configurationDone(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.configurationDone();
    }

    public continue(internal?: boolean): PromiseOrNot<void> {
        return this._chromeDebugAdapter.continue(internal);
    }

    public next(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.next();
    }

    public stepIn(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.stepIn();
    }

    public stepOut(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.stepOut();
    }

    public pause(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.pause();
    }

    public async restartFrame(callFrame: ICallFrame<IScript>): Promise<void> {
        if (!callFrame) {
            return utils.errP(errors.noRestartFrame);
        }
        return this._chromeDebugAdapter.restartFrame();
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

    public evaluate(args: DebugProtocol.EvaluateArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<IEvaluateResponseBody> {
        return this._chromeDebugAdapter.evaluate(args);
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