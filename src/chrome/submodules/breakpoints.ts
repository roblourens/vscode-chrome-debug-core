import { DebugProtocol } from 'vscode-debugprotocol';
import { ISourceIdentifier } from './loadedSource';
import { IZeroBasedLocation, IRuntimeScriptLocation } from './location';
import { Crdp } from '../..';

export interface ISourceBreakpoint {
    source(): ISourceIdentifier;
    requestedLocation(): IZeroBasedLocation;
}

export class SourceBreakpoint {
    constructor(private _source: ISourceIdentifier, private _requestedLocation: IZeroBasedLocation,
        /*private _condition?: string, private _hitCondition?: string*/) {

    }

    public get source(): ISourceIdentifier {
        return this._source;
    }

    public get requestedLocation(): IZeroBasedLocation {
        return this._requestedLocation;
    }
}

export interface BreakpointStatus {
    readonly SourceBreakpoint: SourceBreakpoint;
}

export class BreakpointIsBound implements BreakpointStatus {
    constructor(private _sourceBreakpoint: SourceBreakpoint, private _actualLocation: IZeroBasedLocation) {

    }

    public get SourceBreakpoint(): SourceBreakpoint {
        return this._sourceBreakpoint;
    }

    public get actualLocation(): IZeroBasedLocation {
        return this._actualLocation;
    }
}

export class BreakpointIsNotBound implements BreakpointStatus {
    constructor(private _sourceBreakpoint: SourceBreakpoint) {

    }

    public get SourceBreakpoint(): SourceBreakpoint {
        return this._sourceBreakpoint;
    }
}

export interface INewSetBreakpointsArgs {
    source: ISourceIdentifier;
    breakpoints: DebugProtocol.SourceBreakpoint[];
    lines?: number[];
    sourceModified?: boolean;
    authoredPath?: string;
}

export interface INewAddBreakpointsResult {
    breakpointId?: Crdp.Debugger.BreakpointId;
    actualLocation?: IRuntimeScriptLocation & { scriptId?: Crdp.Runtime.ScriptId }; // TODO: node-debug2 is currently using the scriptId property
}