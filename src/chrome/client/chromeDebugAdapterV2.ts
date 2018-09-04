import {
    IDebugAdapter, ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody,
    ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody,
    IEvaluateResponseBody, LineColTransformer
} from '../..';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ChromeDebugLogic } from '../chromeDebugAdapter';
import { IChromeDebugAdapterOpts, ChromeDebugSession } from '../chromeDebugSession';
import { ChromeConnection } from '../chromeConnection';
import { RuntimeScriptsManager } from '../target/runtimeScriptsManager';
import { CDTPDiagnostics, registerCDTPDiagnosticsPublishersAndHandlers } from '../target/cdtpDiagnostics';
import { DelayMessagesUntilInitializedSession } from './delayMessagesUntilInitializedSession';
import { RemotePathTransformer } from '../../transformers/remotePathTransformer';
import { EagerSourceMapTransformer } from '../../transformers/eagerSourceMapTransformer';
import { StepProgressEventsEmitter } from '../../executionTimingsReporter';
import { ClientToInternal } from './clientToInternal';
import { InternalToClient } from './internalToClient';
import { IGetLoadedSourcesResponseBody } from '../../debugAdapterInterfaces';
import { StackTracesLogic } from '../internal/stackTracesLogic';
import { SkipFilesLogic } from '../internal/features/skipFiles';
import { SmartStepLogic } from '../internal/features/smartStep';
import { EventSender } from './eventSender';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { BreakpointsLogic } from '../internal/breakpoints/breakpointsLogic';
import { Communicator } from '../communication/communicator';
import { HandlesRegistry } from './handlesRegistry';

// TODO DIEGO: Remember to call here and only here         this._lineColTransformer.convertDebuggerLocationToClient(stackFrame); for all responses
export class ChromeDebugAdapter implements IDebugAdapter {
    protected readonly _chromeDebugAdapter: ChromeDebugLogic;
    private readonly _lineColTransformer: LineColTransformer;
    private readonly _sourcesLogic: SourcesLogic;
    protected _scriptsLogic: RuntimeScriptsManager;
    protected readonly _clientToInternal: ClientToInternal;
    private readonly _internalToVsCode: InternalToClient;
    private readonly _stackTraceLogic: StackTracesLogic;
    private readonly _skipFilesLogic: SkipFilesLogic;
    protected readonly _breakpointsLogic: BreakpointsLogic;

    constructor(args: IChromeDebugAdapterOpts, originalSession: ChromeDebugSession) {
        const communicator = new Communicator();

        const sourceMapTransformer = new (args.sourceMapTransformer || EagerSourceMapTransformer)(args.enableSourceMapCaching);
        const pathTransformer = new (args.pathTransformer || RemotePathTransformer)();
        this._scriptsLogic = new RuntimeScriptsManager();
        const chromeDiagnostics = new CDTPDiagnostics(() => chromeConnection.api, this._scriptsLogic, pathTransformer, sourceMapTransformer);
        registerCDTPDiagnosticsPublishersAndHandlers(communicator, chromeDiagnostics);

        const session = new DelayMessagesUntilInitializedSession(originalSession);

        this._lineColTransformer = new (args.lineColTransformer || LineColTransformer)(session);

        this._breakpointsLogic = new BreakpointsLogic(communicator, this._lineColTransformer);

        this._sourcesLogic = new SourcesLogic(chromeDiagnostics, this._scriptsLogic);
        const handlesRegistry = new HandlesRegistry();
        this._clientToInternal = new ClientToInternal(handlesRegistry, this._lineColTransformer, this._sourcesLogic);

        const chromeConnection = new (args.chromeConnection || ChromeConnection)(undefined, args.targetFilter);

        this._internalToVsCode = new InternalToClient(handlesRegistry, this._lineColTransformer);

        const eventSender = EventSender.createWithCommunicator(communicator, session, this._internalToVsCode);

        this._skipFilesLogic = new SkipFilesLogic(this._scriptsLogic, chromeDiagnostics,
            this._stackTraceLogic, sourceMapTransformer, pathTransformer);
        const smartStepLogic = new SmartStepLogic(pathTransformer, sourceMapTransformer, false);
        this._stackTraceLogic = new StackTracesLogic(chromeDiagnostics, this._skipFilesLogic, smartStepLogic);

        this._chromeDebugAdapter = new ChromeDebugLogic(this._lineColTransformer, sourceMapTransformer, pathTransformer, session,
            this._scriptsLogic, this._sourcesLogic, chromeConnection, chromeDiagnostics,
            this._skipFilesLogic, smartStepLogic, eventSender, this._breakpointsLogic);
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
            const desiredBPRecipies = this._clientToInternal.toBreakpoints(args);
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
}