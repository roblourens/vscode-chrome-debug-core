import { Protocol as CDTP } from 'devtools-protocol';

import { CDTPCallFrameRegistry } from '../registries/cdtpCallFrameRegistry';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';
import { ICallFrame, ScriptOrLoadedSource } from '../../internal/stackTraces/callFrame';

export interface EvaluateOnCallFrameRequest {
    readonly frame: ICallFrame<ScriptOrLoadedSource>;
    readonly expression: string;
    readonly objectGroup?: string;
    readonly includeCommandLineAPI?: boolean;
    readonly silent?: boolean;
    readonly returnByValue?: boolean;
    readonly generatePreview?: boolean;
    readonly throwOnSideEffect?: boolean;
    readonly timeout?: CDTP.Runtime.TimeDelta;
}

export interface IInspectDebugeeState {
    callFunctionOn(params: CDTP.Runtime.CallFunctionOnRequest): Promise<CDTP.Runtime.CallFunctionOnResponse>;
    getProperties(params: CDTP.Runtime.GetPropertiesRequest): Promise<CDTP.Runtime.GetPropertiesResponse>;
    evaluate(params: CDTP.Runtime.EvaluateRequest): Promise<CDTP.Runtime.EvaluateResponse>;
    evaluateOnCallFrame(params: EvaluateOnCallFrameRequest): Promise<CDTP.Debugger.EvaluateOnCallFrameResponse>;
}

export class AddSourceUriToExpession {
    private nextEvaluateScriptId = 0;

    constructor(private readonly _prefix: string) { }

    public addURLIfMissing(expression: string): string {
        const sourceUrlPrefix = '\n//# sourceURL=';

        if (expression.indexOf(sourceUrlPrefix) < 0) {
            expression += `${sourceUrlPrefix}<debugger-internal>/${this._prefix}/id=${this.nextEvaluateScriptId++}`;
        }

        return expression;
    }
}

@injectable()
export class CDTPInspectDebugeeState implements IInspectDebugeeState {
    private addSourceUriToEvaluates = new AddSourceUriToExpession('evaluateOnFrame');

    constructor(
        @inject(TYPES.CDTPClient) protected readonly api: CDTP.ProtocolApi,
        private readonly _callFrameRegistry: CDTPCallFrameRegistry) {
    }

    public callFunctionOn(params: CDTP.Runtime.CallFunctionOnRequest): Promise<CDTP.Runtime.CallFunctionOnResponse> {
        return this.api.Runtime.callFunctionOn(params);
    }

    public getProperties(params: CDTP.Runtime.GetPropertiesRequest): Promise<CDTP.Runtime.GetPropertiesResponse> {
        return this.api.Runtime.getProperties(params);
    }

    public evaluate(params: CDTP.Runtime.EvaluateRequest): Promise<CDTP.Runtime.EvaluateResponse> {
        params.expression = this.addSourceUriToEvaluates.addURLIfMissing(params.expression);
        return this.api.Runtime.evaluate(params);
    }

    public evaluateOnCallFrame(params: EvaluateOnCallFrameRequest): Promise<CDTP.Debugger.EvaluateOnCallFrameResponse> {
        return this.api.Debugger.evaluateOnCallFrame({
            callFrameId: this._callFrameRegistry.getFrameId(params.frame.unmappedCallFrame),
            expression: this.addSourceUriToEvaluates.addURLIfMissing(params.expression),
            objectGroup: params.objectGroup,
            includeCommandLineAPI: params.includeCommandLineAPI,
            silent: params.silent,
            returnByValue: params.returnByValue,
            generatePreview: params.generatePreview,
            throwOnSideEffect: params.throwOnSideEffect,
            timeout: params.timeout,
        });
    }
}