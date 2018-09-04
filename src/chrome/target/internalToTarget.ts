import { RuntimeScriptsManager } from './runtimeScriptsManager';
import { IScript } from '../internal/script';
import { Crdp } from '../..';
import { LocationInScript, ScriptOrSource } from '../internal/locationInResource';
import { CallFrame } from '../internal/stackTraces';
import { ValidatedMap } from '../collections/validatedMap';

export class InternalToTarget {
    public getFrameId(frame: CallFrame<ScriptOrSource>): Crdp.Debugger.CallFrameId {
        return this._callFrameToId.get(frame.unmappedCallFrame);
    }

    public getScriptId(script: IScript): Crdp.Runtime.ScriptId {
        return this._scriptsLogic.getCrdpId(script);
    }

    public toCrdpLocation(location: LocationInScript): Crdp.Debugger.Location {
        return {
            scriptId: this.getScriptId(location.script),
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber
        };
    }

    constructor(
        private readonly _scriptsLogic: RuntimeScriptsManager,
        private readonly _callFrameToId: ValidatedMap<CallFrame<IScript>, Crdp.Debugger.CallFrameId>) { }
}