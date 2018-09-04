import { Crdp } from '../..';
import { LocationInScript, ScriptOrSource, LocationInResource, integer } from './locationInResource';
import { IScript } from './script';
import { ILoadedSource } from './loadedSource';

export class Scope {
    constructor(
        public readonly type: ('global' | 'local' | 'with' | 'closure' | 'catch' | 'block' | 'script' | 'eval' | 'module'),
        public readonly object: NonNullable<Crdp.Runtime.RemoteObject>,
        public readonly name?: string,
        public readonly startLocation?: LocationInScript,
        public readonly endLocation?: LocationInScript) { }
}

/** This interface represents the code flow (which code was executed) of a call frame  */
export class CallFrameCodeFlow<TResource extends ScriptOrSource> {
    constructor(
        public readonly index: integer,
        public readonly nameStrategy: NonNullable<ICallFrameName>,
        public readonly location: NonNullable<LocationInResource<TResource>>) { }

    public get source(): TResource extends ILoadedSource ? NonNullable<TResource> : never {
        return this.location.resource as any;
    }

    public get script(): TResource extends IScript ? NonNullable<TResource> : never {
        return this.location.resource as any;
    }

    public get lineNumber(): NonNullable<number> {
        return this.location.lineNumber;
    }

    public get columnNumber(): number {
        return this.location.columnNumber;
    }

    public get name(): string {
        return this.nameStrategy.name;
    }
}

export class StackTraceCodeFlow<TResource extends ScriptOrSource> {
    constructor(
        public readonly callFrames: NonNullable<CallFrameCodeFlow<TResource>[]>,
        public readonly description?: NonNullable<string>,
        public readonly parent?: NonNullable<StackTraceCodeFlow<TResource>>) { }
}

export interface CallFrame<TResource extends ScriptOrSource> {
    readonly index: number;
    readonly source: TResource extends ILoadedSource ? NonNullable<TResource> : never;
    readonly location: NonNullable<LocationInResource<TResource>>;
    readonly lineNumber: NonNullable<number>;
    readonly columnNumber: number;
    readonly name: string;
    readonly codeFlow: NonNullable<CallFrameCodeFlow<TResource>>;
    readonly scopeChain: NonNullable<Scope[]>;
    readonly frameThis?: NonNullable<Crdp.Runtime.RemoteObject>;
    readonly returnValue?: NonNullable<Crdp.Runtime.RemoteObject> ;
    readonly unmappedCallFrame: CallFrame<IScript>;
}

abstract class CallFrameCommonLogic<TResource extends ScriptOrSource> implements CallFrame<TResource> {
    constructor(
        public readonly codeFlow: NonNullable<CallFrameCodeFlow<TResource>>,
        public readonly scopeChain: NonNullable<Scope[]>,
        public readonly frameThis?: NonNullable<Crdp.Runtime.RemoteObject>, // This is optional only to support Runtime.StackTraces aka StackTraceCodeFlow
        public readonly returnValue?: NonNullable<Crdp.Runtime.RemoteObject>) { }

    public abstract get unmappedCallFrame(): CallFrame<IScript>;

    public get source(): TResource extends ILoadedSource ? NonNullable<TResource> : never {
        return this.codeFlow.source;
    }

    public get location(): NonNullable<LocationInResource<TResource>> {
        return this.codeFlow.location;
    }

    public get lineNumber(): NonNullable<number> {
        return this.codeFlow.lineNumber;
    }

    public get columnNumber(): number {
        return this.codeFlow.columnNumber;
    }

    public get index(): number {
        return this.codeFlow.index;
    }

    public get name(): string {
        return this.codeFlow.name;
    }
}

export class ScriptCallFrame extends CallFrameCommonLogic<IScript> {
    public get unmappedCallFrame(): CallFrame<IScript> {
        return this;
    }
}

export class LoadedSourceCallFrame extends CallFrameCommonLogic<ILoadedSource> {
    constructor(
        public readonly unmappedCallFrame: CallFrame<IScript>,
        public readonly codeFlow: NonNullable<CallFrameCodeFlow<ILoadedSource>>,
        public readonly scopeChain: NonNullable<Scope[]>,
        public readonly frameThis?: NonNullable<Crdp.Runtime.RemoteObject>, // This is optional only to support Runtime.StackTraces aka StackTraceCodeFlow
        public readonly returnValue?: NonNullable<Crdp.Runtime.RemoteObject>) {
        super(codeFlow, scopeChain, frameThis, returnValue);
    }
}

export interface IAdditionalPresentationDetails {
    additionalSourceOrigins: string[];
    sourcePresentationHint: 'normal' | 'emphasize' | 'deemphasize';
}

export type SourcePresentationHint = 'normal' | 'emphasize' | 'deemphasize';
export type CallFramePresentationHint = 'normal' | 'label' | 'subtle';

export class CallFramePresentation<TResource extends ScriptOrSource> {
    constructor(
        public readonly callFrame: NonNullable<CallFrameCodeFlow<TResource>>,
        public readonly additionalPresentationDetails?: IAdditionalPresentationDetails,
        public readonly presentationHint?: CallFramePresentationHint) { }

    public get name(): string {
        return this.callFrame.name;
    }

    public get source(): ILoadedSource {
        return this.callFrame.source;
    }

    public get location(): NonNullable<LocationInResource<TResource>> {
        return this.callFrame.location;
    }

    public get lineNumber(): NonNullable<number> {
        return this.callFrame.lineNumber;
    }

    public get columnNumber(): number {
        return this.callFrame.columnNumber;
    }
}

export class StackTraceLabel {
    constructor(public readonly description: string) { }
}

export type CallFramePresentationOrLabel<TResource extends ScriptOrSource> = CallFramePresentation<TResource> | StackTraceLabel;

export interface ICallFrameName {
    name: string;
}

export class NamedFunctionCallFrameName implements ICallFrameName {
    constructor(public readonly name: string) { }
}

export class UnamedFunctionInEvalScriptCallFrameName implements ICallFrameName {
    public readonly name = '(eval code)';
}

export class UnamedFunctionInFileCallFrameName implements ICallFrameName {
    public readonly name = '(anonymous function)';
}

export class FormattedName implements ICallFrameName {
    constructor(public readonly name: string) { }
}

export function createCallFrameName(script: IScript, functionName: string) {
    if (functionName) {
        return new NamedFunctionCallFrameName(functionName);
    } else if (script.runtimeSource.doesScriptHasUrl()) {
        return new UnamedFunctionInEvalScriptCallFrameName();
    } else {
        return new UnamedFunctionInFileCallFrameName();
    }
}

export interface StackTracePresentation {
    stackFrames: CallFramePresentationOrLabel<ILoadedSource>[];
    totalFrames?: number;
}
