import { IScript } from '../../internal/scripts/script';
import { Protocol as CDTP } from 'devtools-protocol';
import { ValidatedMap } from '../../collections/validatedMap';
import { ICallFrame, ScriptOrLoadedSource } from '../../internal/stackTraces/callFrame';
import { injectable } from 'inversify';

@injectable()
export class CDTPCallFrameRegistry {
    private readonly _callFrameToId = new ValidatedMap<ICallFrame<IScript>, CDTP.Debugger.CallFrameId>();

    public registerFrameId(callFrameId: CDTP.Debugger.CallFrameId, frame: ICallFrame<IScript>): void {
        this._callFrameToId.set(frame, callFrameId);
    }

    public getFrameId(frame: ICallFrame<ScriptOrLoadedSource>): CDTP.Debugger.CallFrameId {
        return this._callFrameToId.get(frame.unmappedCallFrame);
    }
}