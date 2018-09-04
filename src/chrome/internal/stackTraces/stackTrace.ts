import { CodeFlowFrame, ScriptOrLoadedSource } from './callFrame';

export class CodeFlowStackTrace<TResource extends ScriptOrLoadedSource> {
    constructor(
        public readonly codeFlowFrames: CodeFlowFrame<TResource>[],
        public readonly description?: string,
        public readonly parent?: CodeFlowStackTrace<TResource>) { }
}
