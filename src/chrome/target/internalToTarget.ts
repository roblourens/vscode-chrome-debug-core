import { RuntimeScriptsManager } from './runtimeScriptsManager';
import { IScript } from '../internal/script';
import { Crdp } from '../..';
import { LocationInScript, ScriptOrSource, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../internal/locationInResource';
import { CallFrame } from '../internal/stackTraces';
import { ValidatedMap } from '../collections/validatedMap';
import { IBPRecipie, BPRecipie } from '../internal/breakpoints/bpRecipie';
import { AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpBehavior';
import { BreakpointIdRegistry } from './breakpointIdRegistry';

export class InternalToTarget {
    public getBPRecipieCondition(bpRecipie: IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp, AlwaysBreak | ConditionalBreak>): string | undefined {
        return bpRecipie.behavior.execute({
            alwaysBreak: () => undefined,
            conditionalBreak: conditionalBreak => conditionalBreak.expressionOfWhenToBreak
        });
    }

    public getBreakpointId(bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): Crdp.Debugger.BreakpointId {
        return this._breakpointIdRegistry.getBreakpointId(bpRecipie);
    }

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
        private readonly _callFrameToId: ValidatedMap<CallFrame<IScript>, Crdp.Debugger.CallFrameId>,
        private readonly _breakpointIdRegistry: BreakpointIdRegistry) { }
}