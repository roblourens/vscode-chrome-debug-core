/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { DebugProtocol } from 'vscode-debugprotocol';
import { StackTraceCodeFlow } from './internal/stackTraces';
import { IScript } from './internal/script';
import { parseResourceIdentifier } from './internal/resourceIdentifier';

export class InternalSourceBreakpoint {
    static readonly LOGPOINT_URL = 'vscode.logpoint.js';

    readonly line: number;
    readonly column?: number;
    readonly condition?: string;
    readonly hitCondition?: string;

    constructor(breakpoint: DebugProtocol.SourceBreakpoint) {
        this.line = breakpoint.line;
        this.column = breakpoint.column;
        this.hitCondition = breakpoint.hitCondition;

        if (breakpoint.logMessage) {
            this.condition = logMessageToExpression(breakpoint.logMessage);
            if (breakpoint.condition) {
                this.condition = `(${breakpoint.condition}) && ${this.condition}`;
            }
        } else if (breakpoint.condition) {
            this.condition = breakpoint.condition;
        }
    }
}

function isLogpointStack(stackTrace: StackTraceCodeFlow<IScript> | null): boolean {
    return stackTrace && stackTrace.callFrames.length > 0 && stackTrace.callFrames[0].script.runtimeSource.identifier.isEquivalent(parseResourceIdentifier(InternalSourceBreakpoint.LOGPOINT_URL));
}

export function stackTraceWithoutLogpointFrame(stackTrace: StackTraceCodeFlow<IScript>): StackTraceCodeFlow<IScript> {
    if (isLogpointStack(stackTrace)) {
        return {
            ...stackTrace,
            callFrames: stackTrace.callFrames.slice(1)
        };
    }

    return stackTrace;
}

const LOGMESSAGE_VARIABLE_REGEXP = /{(.*?)}/g;

function logMessageToExpression(msg: string): string {
    msg = msg.replace('%', '%%');

    const args: string[] = [];
    let format = msg.replace(LOGMESSAGE_VARIABLE_REGEXP, (_match, group) => {
        const a = group.trim();
        if (a) {
            args.push(`(${a})`);
            return '%O';
        } else {
            return '';
        }
    });

    format = format.replace('\'', '\\\'');

    const argStr = args.length ? `, ${args.join(', ')}` : '';
    return `console.log('${format}'${argStr});\n//# sourceURL=${InternalSourceBreakpoint.LOGPOINT_URL}`;
}
