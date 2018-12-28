import { ScriptOrLoadedSource } from '../locations/location';

import { ILoadedSource } from '../sources/loadedSource';
import { ICodeFlowFramePresentation, CodeFlowFramePresentation, CallFramePresentation } from './callFramePresentation';

export interface CodeFlowFramePresentationRow<TResource extends ScriptOrLoadedSource> {
    hasCodeFlow(): this is ICodeFlowFramePresentation<TResource>;
    hasCallFrame(): this is CallFramePresentation<TResource>;
}

export class StackTraceLabel<TResource extends ScriptOrLoadedSource> implements CodeFlowFramePresentationRow<TResource> {
    public hasCallFrame(): this is CallFramePresentation<TResource> {
        return false;
    }

    public hasCodeFlow(): this is ICodeFlowFramePresentation<TResource> {
        return false;
    }

    constructor(public readonly description: string) { }
}

export type FramePresentationOrLabel<TResource extends ScriptOrLoadedSource> = CodeFlowFramePresentation<TResource> | CallFramePresentation<TResource> | StackTraceLabel<TResource>;

export interface StackTracePresentation {
    readonly stackFrames: FramePresentationOrLabel<ILoadedSource>[];
    readonly totalFrames?: number;
}
