import { IScript } from './scripts/script';
import { ILoadedSource } from './sources/loadedSource';
import { ICallFrame } from './stackTraces/callFrame';

export interface EvaluateArguments {
    expression: string;
    frame?: ICallFrame<ILoadedSource>;
    context?: string;
    format?: {
        /** Display the value in hex. */
        hex?: boolean;
    };
}

export interface CompletionsArguments {
    frame?: ICallFrame<IScript>;
    text: string;
    column: number;
    line?: number;
}
