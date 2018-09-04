import { IScript } from './scripts/script';
import { ILoadedSource } from './sources/loadedSource';
import { CallFrame } from './stackTraces/callFrame';

export interface EvaluateArguments {
    expression: string;
    frame?: CallFrame<ILoadedSource>;
    context?: string;
    format?: {
        /** Display the value in hex. */
        hex?: boolean;
    };
}

export interface CompletionsArguments {
    frame?: CallFrame<IScript>;
    text: string;
    column: number;
    line?: number;
}
