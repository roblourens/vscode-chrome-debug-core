import { ScriptOrLoadedSource, Location } from '../locations/location';
import { integer } from '../../target/events';
import { ILoadedSource } from '../sources/loadedSource';
import { IScript } from '../scripts/script';
import { Crdp } from '../../..';
import { ICallFrameName } from './callFrameName';
import { Scope } from './scopes';

/** This interface represents the code flow (which code was executed) of a call frame  */
export class CodeFlowFrame<TResource extends ScriptOrLoadedSource> {
    constructor(
        public readonly index: integer,
        public readonly nameStrategy: ICallFrameName,
        public readonly location: Location<TResource>) { }

    public get source(): TResource extends ILoadedSource ? TResource : never {
        return this.location.resource as any;
    }

    public get script(): TResource extends IScript ? TResource : never {
        return this.location.resource as any;
    }

    public get lineNumber(): number {
        return this.location.lineNumber;
    }

    public get columnNumber(): number {
        return this.location.columnNumber;
    }

    public get name(): string {
        return this.nameStrategy.name;
    }
}

export interface ICallFrame<TResource extends ScriptOrLoadedSource> {
    readonly index: number;
    readonly source: TResource extends ILoadedSource ? TResource : never;
    readonly location: Location<TResource>;
    readonly lineNumber: number;
    readonly columnNumber: number;
    readonly name: string;
    readonly codeFlow: CodeFlowFrame<TResource>;
    readonly scopeChain: Scope[];
    readonly frameThis?: Crdp.Runtime.RemoteObject;
    readonly returnValue?: Crdp.Runtime.RemoteObject;
    readonly unmappedCallFrame: ICallFrame<IScript>;
}

abstract class CallFrameCommonLogic<TResource extends ScriptOrLoadedSource> implements ICallFrame<TResource> {
    public abstract get scopeChain(): Scope[];
    public abstract get unmappedCallFrame(): ICallFrame<IScript>;
    public abstract get codeFlow(): CodeFlowFrame<TResource>;

    public get source(): TResource extends ILoadedSource ? TResource : never {
        return this.codeFlow.source;
    }

    public get location(): Location<TResource> {
        return this.codeFlow.location;
    }

    public get lineNumber(): number {
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
    public get unmappedCallFrame(): ICallFrame<IScript> {
        return this;
    }

    constructor(
        public readonly codeFlow: CodeFlowFrame<IScript>,
        public readonly scopeChain: Scope[],
        public readonly frameThis?: Crdp.Runtime.RemoteObject, // This is optional only to support Runtime.StackTraces aka StackTraceCodeFlow
        public readonly returnValue?: Crdp.Runtime.RemoteObject) {
        super();
    }
}

export class LoadedSourceCallFrame extends CallFrameCommonLogic<ILoadedSource> {
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
        public readonly unmappedCallFrame: ICallFrame<IScript>,
        public readonly codeFlow: CodeFlowFrame<ILoadedSource>) {
        super();
    }
}
