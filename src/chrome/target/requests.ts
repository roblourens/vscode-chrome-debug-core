import { Crdp } from '../..';
import { LocationInScript, ScriptOrSource } from '../internal/locationInResource';
import { CallFrame } from '../internal/stackTraces/callFrame';

export interface INewSetBreakpointResult {
    breakpointId?: Crdp.Debugger.BreakpointId;
    actualLocation?: LocationInScript;
}

export interface INewAddBreakpointsResult {
    breakpointId?: Crdp.Debugger.BreakpointId;
    actualLocation?: LocationInScript & { scriptId?: Crdp.Runtime.ScriptId }; // TODO: node-debug2 is currently using the scriptId property
}

export interface EvaluateOnCallFrameRequest {
    frame: CallFrame<ScriptOrSource>;
    expression: string;
    objectGroup?: string;
    includeCommandLineAPI?: boolean;
    silent?: boolean;
    returnByValue?: boolean;
    generatePreview?: boolean;
    throwOnSideEffect?: boolean;
    timeout?: Crdp.Runtime.TimeDelta;
}