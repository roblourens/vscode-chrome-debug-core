import { IScript } from '../internal/script';

import { Crdp } from '../..';

import { StackTraceCodeFlow, CallFrame } from '../internal/stackTraces';
import { ScriptOrSource } from '../internal/locationInResource';

export type integer = number;

export interface ScriptParsedEvent {
    readonly script: IScript;
    readonly url: string;
    readonly startLine: integer;
    readonly startColumn: integer;
    readonly endLine: integer;
    readonly endColumn: integer;
    readonly executionContextId: Crdp.Runtime.ExecutionContextId;
    readonly hash: string;
    readonly executionContextAuxData?: any;
    readonly isLiveEdit?: boolean;
    readonly sourceMapURL?: string;
    readonly hasSourceURL?: boolean;
    readonly isModule?: boolean;
    readonly length?: integer;
    readonly stackTrace?: StackTraceCodeFlow<IScript>;
}

export class PausedEvent {
    constructor(
        public readonly callFrames: NonNullable<CallFrame<IScript>[]>,
        public readonly reason: ('XHR' | 'DOM' | 'EventListener' | 'exception' | 'assert' | 'debugCommand' | 'promiseRejection' | 'OOM' | 'other' | 'ambiguous'),
        public readonly data?: any,
        public hitBreakpoints?: string[], // TODO DIEGO: Make this readonly
        public readonly asyncStackTrace?: StackTraceCodeFlow<IScript>,
        public readonly asyncStackTraceId?: Crdp.Runtime.StackTraceId,
        public readonly asyncCallStackTraceId?: Crdp.Runtime.StackTraceId) { }
}

export interface ConsoleAPICalledEvent {
    readonly type: ('log' | 'debug' | 'info' | 'error' | 'warning' | 'dir' | 'dirxml' | 'table' | 'trace' | 'clear' | 'startGroup' | 'startGroupCollapsed' | 'endGroup' | 'assert' | 'profile' | 'profileEnd' | 'count' | 'timeEnd');
    readonly args: Crdp.Runtime.RemoteObject[];
    readonly executionContextId: Crdp.Runtime.ExecutionContextId;
    readonly timestamp: Crdp.Runtime.Timestamp;
    readonly stackTrace?: StackTraceCodeFlow<IScript>;
    readonly context?: string;
}

export interface ExceptionThrownEvent {
    readonly timestamp: Crdp.Runtime.Timestamp;
    readonly exceptionDetails: ExceptionDetails;
}

export interface ExceptionDetails {
    readonly exceptionId: integer;
    readonly text: string;
    readonly lineNumber: integer;
    readonly columnNumber: integer;
    readonly script?: IScript;
    readonly url?: string;
    readonly stackTrace?: StackTraceCodeFlow<IScript>;
    readonly exception?: Crdp.Runtime.RemoteObject;
    readonly executionContextId?: Crdp.Runtime.ExecutionContextId;
}

export interface SetVariableValueRequest {
    readonly scopeNumber: integer;
    readonly variableName: string;
    readonly newValue: Crdp.Runtime.CallArgument;
    readonly frame: CallFrame<ScriptOrSource>;
}

export type LogEntrySource = 'xml' | 'javascript' | 'network' | 'storage' | 'appcache' | 'rendering' | 'security' | 'deprecation' | 'worker' | 'violation' | 'intervention' | 'recommendation' | 'other';
export type LogLevel = 'verbose' | 'info' | 'warning' | 'error';

export interface LogEntry {
    source: LogEntrySource;
    level: LogLevel;
    text: string;
    timestamp: Crdp.Runtime.Timestamp;
    url?: string;
    lineNumber?: integer;
    stackTrace?: StackTraceCodeFlow<IScript>;
    networkRequestId?: Crdp.Network.RequestId;
    workerId?: string;
    args?: Crdp.Runtime.RemoteObject[];
}
