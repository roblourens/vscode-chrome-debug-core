import {
    ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody,
    ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody,
    IEvaluateResponseBody, LineColTransformer, utils, IExceptionInfoResponseBody, IDebugAdapterState
} from '../../..';
import * as errors from '../../../errors';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ChromeDebugLogic } from '../../chromeDebugAdapter';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { ClientToInternal } from '../clientToInternal';
import { InternalToClient } from '../internalToClient';
import { IGetLoadedSourcesResponseBody } from '../../../debugAdapterInterfaces';
import { StackTracesLogic } from '../../internal/stackTraces/stackTracesLogic';
import { SkipFilesLogic } from '../../internal/features/skipFiles';
import { SourcesLogic } from '../../internal/sources/sourcesLogic';
import { BreakpointsLogic } from '../../internal/breakpoints/breakpointsLogic';
import { CDTPScriptsRegistry } from '../../target/cdtpScriptsRegistry';
import { PauseOnExceptionOrRejection } from '../../internal/exceptions/pauseOnException';
import { Stepping } from '../../internal/stepping/stepping';
import { DotScriptCommand } from '../../internal/sources/features/dotScriptsCommand';

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

    // Are these needed?
    // supportedDomains: SupportedDomains;
    // smartStepLogic: SmartStepLogic;
}

// TODO DIEGO: Remember to call here and only here         this._lineColTransformer.convertDebuggerLocationToClient(stackFrame); for all responses
export class ConnectedCDA implements IDebugAdapterState {
    public static SCRIPTS_COMMAND = '.scripts';

    protected readonly _chromeDebugAdapter: ChromeDebugLogic;
    private readonly _sourcesLogic: SourcesLogic;
    protected _scriptsLogic: CDTPScriptsRegistry;
    protected readonly _clientToInternal: ClientToInternal;
    private readonly _internalToVsCode: InternalToClient;
    private readonly _stackTraceLogic: StackTracesLogic;
    protected readonly _breakpointsLogic: BreakpointsLogic;
    public readonly _pauseOnException: PauseOnExceptionOrRejection;
    private readonly _stepping: Stepping;
    public readonly _dotScriptCommand: DotScriptCommand;

    constructor(private readonly _dependencies: ConnectedCDADependencies) {

    }

    public get chrome(): CDTPDiagnostics {
        return this._chromeDebugAdapter.chrome;
    }

    public shutdown(): void {
        return this._chromeDebugAdapter.shutdown();
    }

    public disconnect(_: DebugProtocol.DisconnectArguments): PromiseOrNot<void> {
        return this._chromeDebugAdapter.disconnect();
    }

    public async setBreakpoints(args: DebugProtocol.SetBreakpointsArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector): Promise<ISetBreakpointsResponseBody> {
        if (args.breakpoints) {
            const desiredBPRecipies = this._clientToInternal.toBPRecipies(args);
            const bpRecipiesStatus = await this._dependencies.breakpointsLogic.setBreakpoints(desiredBPRecipies, telemetryPropertyCollector);
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

    public async restartFrame(args: DebugProtocol.RestartFrameRequest): Promise<void> {
        const callFrame = this._clientToInternal.getCallFrameById(args.arguments.frameId);
        if (callFrame.hasCodeFlow()) {
            return this._stepping.restartFrame(callFrame.codeFlow);
        } else {
            throw new Error(`Cannot restart to a frame that doesn't have state information`);
        }
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

    public async exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): Promise<IExceptionInfoResponseBody> {
        if (args.threadId !== ChromeDebugLogic.THREAD_ID) {
            throw errors.invalidThread(args.threadId);
        }

        return this._internalToVsCode.toExceptionInfo(await this._pauseOnException.latestExceptionInfo());
    }

    public launch(_args: ILaunchRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): never {
        throw new Error("Can't launch to a new target while connected to a previous target");
    }

    public attach(_args: IAttachRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): never {
        throw new Error("Can't attach to a new target while connected to a previous target");
    }

    public initialize(_args: DebugProtocol.InitializeRequestArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<{ capabilities: DebugProtocol.Capabilities; newState: IDebugAdapterState; }> {
        throw new Error('The debug adapter is already initialized. Calling initialize again is not supported.');
    }
}
