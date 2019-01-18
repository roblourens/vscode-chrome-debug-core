/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { LoadedSourceCallFrame } from './stackTraces/callFrame';

export interface EvaluateArguments {
    readonly expression: string;
    readonly frame?: LoadedSourceCallFrame;
    readonly context?: string;
    readonly format?: {
        /** Display the value in hex. */
        readonly hex?: boolean;
    };
}

export interface CompletionsArguments {
    readonly frame?: LoadedSourceCallFrame;
    readonly text: string;
    readonly column: number;
    readonly line?: number;
}
