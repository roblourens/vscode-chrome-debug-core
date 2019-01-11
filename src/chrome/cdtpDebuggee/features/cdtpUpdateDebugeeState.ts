import { Protocol as CDTP } from 'devtools-protocol';

import { CDTPCallFrameRegistry } from '../registries/cdtpCallFrameRegistry';
import { TYPES } from '../../dependencyInjection.ts/types';
import { injectable, inject } from 'inversify';
import { ICallFrame, ScriptOrLoadedSource } from '../../internal/stackTraces/callFrame';
import { integer } from '../cdtpPrimitives';

export interface SetVariableValueRequest {
    readonly scopeNumber: integer;
    readonly variableName: string;
    readonly newValue: CDTP.Runtime.CallArgument;
    readonly frame: ICallFrame<ScriptOrLoadedSource>;
}

export interface IUpdateDebugeeState {
    setVariableValue(params: SetVariableValueRequest): Promise<void>;
}

@injectable()
export class CDTPUpdateDebugeeState implements IUpdateDebugeeState {
    constructor(
        @inject(TYPES.CDTPClient) private readonly api: CDTP.ProtocolApi,
        private readonly _callFrameRegistry: CDTPCallFrameRegistry) {
    }

    public setVariableValue(params: SetVariableValueRequest): Promise<void> {
        return this.api.Debugger.setVariableValue({
            callFrameId: this._callFrameRegistry.getFrameId(params.frame),
            scopeNumber: params.scopeNumber,
            variableName: params.variableName,
            newValue: params.newValue
        });
    }
}