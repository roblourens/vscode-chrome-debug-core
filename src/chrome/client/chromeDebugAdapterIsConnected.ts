import {
    ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody,
    ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody,
    IEvaluateResponseBody, LineColTransformer, ICommonRequestArgs, logger, utils, IExceptionInfoResponseBody
} from '../..';
import * as errors from '../../errors';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ChromeDebugLogic, ChromeDebugAdapter } from '../chromeDebugAdapter';
import { IChromeDebugAdapterOpts, ChromeDebugSession } from '../chromeDebugSession';
import { ChromeConnection } from '../chromeConnection';
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
import { ChromeDebugAdapterState } from './chromeDebugAdapterState';
import { ExecutionLogger } from '../logging/executionLogger';
import { Internal } from '../communication/internalChannels';
import { Client } from '../communication/clientChannels';
import { Target } from '../communication/targetChannels';
import { CDTPScriptsRegistry } from '../target/cdtpScriptsRegistry';
import { DoNotPauseWhileSteppingSession } from './doNotPauseWhileSteppingSession';
import { ILoadedSource } from '../internal/sources/loadedSource';
import { asyncMap } from '../collections/async';
import { PauseOnExceptionDependencies, PauseOnExceptionOrRejection } from '../internal/exceptions/pauseOnException';
import { SteppingDependencies, Stepping } from '../internal/stepping/stepping';
import { TakeProperActionOnPausedEventDependencies, TakeProperActionOnPausedEvent } from '../internal/features/takeProperActionOnPausedEvent';
import { IDotScriptCommandDependencies, DotScriptCommand } from '../internal/sources/features/dotScriptsCommand';
import { ICallFrame } from '../internal/stackTraces/callFrame';
import { IScript } from '../internal/scripts/script';

export interface ConnectedCDADependencies {
    chromeDebugAdapter: ChromeDebugLogic;
    lineColTransformer: LineColTransformer;
    sourcesLogic: SourcesLogic;
    scriptLogic: CDTPScriptsRegistry;
    clientToInternal: ClientToInternal;
    internalToVsCode: InternalToClient;
    stackTraceLogic: StackTracesLogic;
    skipFilesLogic: SkipFilesLogic;
    breakpointsLogic: BreakpointsLogic;
    pauseOnException: PauseOnExceptionOrRejection;
    stepping: Stepping;
    dotScriptCommand: DotScriptCommand;
}

// TODO DIEGO: Remember to call here and only here         this._lineColTransformer.convertDebuggerLocationToClient(stackFrame); for all responses
export class ConnectedCDA implements ChromeDebugAdapterState {
    public static SCRIPTS_COMMAND = '.scripts';

    protected readonly _chromeDebugAdapter: ChromeDebugLogic;
    private readonly _lineColTransformer: LineColTransformer;
    private readonly _sourcesLogic: SourcesLogic;
    protected _scriptsLogic: CDTPScriptsRegistry;
    protected readonly _clientToInternal: ClientToInternal;
    private readonly _internalToVsCode: InternalToClient;
    private readonly _stackTraceLogic: StackTracesLogic;
    private readonly _skipFilesLogic: SkipFilesLogic;
    protected readonly _breakpointsLogic: BreakpointsLogic;
    public readonly _pauseOnException: PauseOnExceptionOrRejection;
    private readonly _stepping: Stepping;
    public readonly _dotScriptCommand: DotScriptCommand;

    constructor(private readonly _dependencies: ConnectedCDADependencies) {

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

    public async evaluate(args: DebugProtocol.EvaluateArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<IEvaluateResponseBody> {
        if (args.expression.startsWith(ConnectedCDA.SCRIPTS_COMMAND)) {
            const scriptsRest = utils.lstrip(args.expression, ConnectedCDA.SCRIPTS_COMMAND).trim();
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

    public launch(_args: ILaunchRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<void> {
        throw new Error('Method not implemented.');
    }

    public attach(_args: IAttachRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<void> {
        throw new Error("Can't attach to a new target while connected to a previous target");
    }

    public async exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): Promise<IExceptionInfoResponseBody> {
        if (args.threadId !== ChromeDebugLogic.THREAD_ID) {
            throw errors.invalidThread(args.threadId);
        }

        return this._internalToVsCode.toExceptionInfo(await this._pauseOnException.latestExceptionInfo());
    }
}
