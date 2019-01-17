export type CallFramePresentationHint = 'normal' | 'label' | 'subtle';

// Row of a stack trace that we send to the client
export interface StackTracePresentationRow {
    readonly presentationHint?: CallFramePresentationHint;
}

// Row of a stack trace that is a label e.g.: [Show more frames] or [Frames skipped by smartStep], etc...
export class StackTraceLabel implements StackTracePresentationRow {
    public readonly presentationHint = 'label';

    constructor(public readonly description: string) { }
}
