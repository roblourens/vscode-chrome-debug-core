import {
    IDebugAdapter, ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody,
    ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody,
    IEvaluateResponseBody, ICommonRequestArgs, IExceptionInfoResponseBody, utils, IGetLoadedSourcesResponseBody
} from '../..';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ChromeDebugLogic } from '../chromeDebugAdapter';
import { IChromeDebugAdapterOpts, ChromeDebugSession } from '../chromeDebugSession';
import { ChromeConnection } from '../chromeConnection';
import { CDTPDiagnostics } from '../target/cdtpDiagnostics';
import { ICallFrame } from '../internal/stackTraces/callFrame';
import { IScript } from '../internal/scripts/script';
import { StepProgressEventsEmitter } from '../../executionTimingsReporter';
import { TargetConnectionConfigurator } from './targetConnectionCreator';
import { ChromeDebugAdapterState } from './chromeDebugAdapterState';
import { UnconnectedCDA } from './chromeDebugAdapterIsUnconnected';

export class ChromeDebugAdapter implements IDebugAdapter {
    private _state: ChromeDebugAdapterState = new UnconnectedCDA();

    public events = new StepProgressEventsEmitter();

    constructor(_args: IChromeDebugAdapterOpts, _originalSession: ChromeDebugSession) {
    }

    public shutdown(): void {
        return this._state.shutdown();
    }

    public initialize(args: DebugProtocol.InitializeRequestArguments, _?: ITelemetryPropertyCollector, _2?: number): DebugProtocol.Capabilities {
        return this._state.initialize(args);
    }

    public launch(args: ILaunchRequestArgs, _?: ITelemetryPropertyCollector, _2?: number): Promise<void> {
        const chromeConnection = new (args.chromeConnection || ChromeConnection)(undefined, args.targetFilter);
        new TargetConnectionCreator(this, chromeConnection, ScenarioType.Launch, this.args);
        return this._state.launch(args);
    }

    public attach(args: IAttachRequestArgs, _?: ITelemetryPropertyCollector, _2?: number): Promise<void> {
        return this._state.attach(args);
    }

    public disconnect(_: DebugProtocol.DisconnectArguments): PromiseOrNot<void> {
        return this._state.disconnect();
    }

    public async setBreakpoints(args: DebugProtocol.SetBreakpointsArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector): Promise<ISetBreakpointsResponseBody> {
        return this._state.setBreakpoints(args, telemetryPropertyCollector);
    }

    public async setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments, _?: ITelemetryPropertyCollector, _2?: number): Promise<void> {
        return this._state.setExceptionBreakpoints(args);
    }

    public configurationDone(): PromiseOrNot<void> {
        return this._state.configurationDone();
    }

    public continue(): PromiseOrNot<void> {
        return this._state.continue();
    }

    public next(): PromiseOrNot<void> {
        return this._state.next();
    }

    public stepIn(): PromiseOrNot<void> {
        return this._state.stepIn();
    }

    public stepOut(): PromiseOrNot<void> {
        return this._state.stepOut();
    }

    public pause(): PromiseOrNot<void> {
        return this._state.pause();
    }

    public async restartFrame(callFrame: ICallFrame<IScript>): Promise<void> {
        return this._state.restartFrame(callFrame);
    }

    public async stackTrace(args: DebugProtocol.StackTraceArguments, _?: ITelemetryPropertyCollector, _2?: number): Promise<IStackTraceResponseBody> {
        return this._state.stackTrace(args);
    }

    public scopes(args: DebugProtocol.ScopesArguments, _?: ITelemetryPropertyCollector, _2?: number): PromiseOrNot<IScopesResponseBody> {
        return this._state.scopes(args);
    }

    public variables(args: DebugProtocol.VariablesArguments, _?: ITelemetryPropertyCollector, _2?: number): PromiseOrNot<IVariablesResponseBody> {
        return this._state.variables(args);
    }

    public async source(args: DebugProtocol.SourceArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<ISourceResponseBody> {
        return this._state.source(args, _telemetryPropertyCollector);
    }

    public threads(): PromiseOrNot<IThreadsResponseBody> {
        return this._state.threads();
    }

    public async evaluate(args: DebugProtocol.EvaluateArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<IEvaluateResponseBody> {
        return this._state.evaluate(args, _telemetryPropertyCollector);
    }

    public async loadedSources(): Promise<IGetLoadedSourcesResponseBody> {
        return this._state.loadedSources();
    }

    public setFunctionBreakpoints(_args: DebugProtocol.SetFunctionBreakpointsArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<DebugProtocol.SetFunctionBreakpointsResponse> {
        throw new Error('Method not implemented.');
    }

    public setVariable(_args: DebugProtocol.SetVariableArguments, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): PromiseOrNot<DebugProtocol.SetVariableResponse> {
        throw new Error('Method not implemented.');
    }

    public commonArgs(args: ICommonRequestArgs): void {
        return this.chromeDebugAdapter.commonArgs(args);
    }

    public async exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): Promise<IExceptionInfoResponseBody> {
        return this._state.exceptionInfo(args);
    }
}