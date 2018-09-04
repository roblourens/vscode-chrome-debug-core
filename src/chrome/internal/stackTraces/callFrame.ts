import { ScriptOrSource, LocationInResource, LocationInLoadedSource } from '../locationInResource';
import { integer } from '../../target/events';
import { ICallFrameName } from './callFrameName';
import { ILoadedSource } from '../loadedSource';
import { IScript } from '../script';
import { Crdp } from '../../..';
import { Scope } from './scopes';

/** This interface represents the code flow (which code was executed) of a call frame  */
export class CodeFlowFrame<TResource extends ScriptOrSource> {
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

export interface CallFrame<TResource extends ScriptOrSource> {
    readonly index: number;
    readonly source: TResource extends ILoadedSource ? NonNullable<TResource> : never;
    readonly location: NonNullable<LocationInResource<TResource>>;
    readonly lineNumber: NonNullable<number>;
    readonly columnNumber: number;
    readonly name: string;
    readonly codeFlow: NonNullable<CodeFlowFrame<TResource>>;
    readonly scopeChain: NonNullable<Scope[]>;
    readonly frameThis?: NonNullable<Crdp.Runtime.RemoteObject>;
    readonly returnValue?: NonNullable<Crdp.Runtime.RemoteObject>;
    readonly unmappedCallFrame: CallFrame<IScript>;
}

abstract class CallFrameCommonLogic<TResource extends ScriptOrSource> implements CallFrame<TResource> {
    constructor(
        public readonly codeFlow: NonNullable<CodeFlowFrame<TResource>>,
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

export class LoadedSourceCallFrame implements CallFrame<ILoadedSource> {
    public get index(): number {
        return this.codeFlow.index;
    }

    public get source(): ILoadedSource<string> {
        return this.codeFlow.source;
    }

    public get location(): LocationInLoadedSource {
        return this.codeFlow.location;
    }

    public get lineNumber(): number {
        return this.codeFlow.lineNumber;
    }

    public get columnNumber(): number {
        return this.codeFlow.columnNumber;
    }

    public get name(): string {
        return this.codeFlow.name;
    }

    public get scopeChain(): Scope[] {
        return this.unmappedCallFrame.scopeChain;
    }

    public get frameThis(): Crdp.Runtime.RemoteObject {
        return this.unmappedCallFrame.frameThis;
    }

    public get returnValue(): Crdp.Runtime.RemoteObject {
        return this.unmappedCallFrame.returnValue;
    }

    constructor(
        public readonly unmappedCallFrame: CallFrame<IScript>,
        public readonly codeFlow: NonNullable<CodeFlowFrame<ILoadedSource>>) {
    }
}
