import { DebugProtocol } from 'vscode-debugprotocol';
import { ISourceIdentifier } from '../sourceIdentifier';
import { LocationInResource, ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInUrl, LocationInUrlRegexp } from '../locationInResource';
import { ILoadedSource } from '../loadedSource';
import { IScript } from '../script';
import { IBehaviorRecipie } from './behaviorRecipie';
import { IResourceIdentifier } from '../resourceIdentifier';
import { utils } from '../../..';

export interface INewSetBreakpointsArgs {
    source: ISourceIdentifier;
    breakpoints: DebugProtocol.SourceBreakpoint[];
    lines?: number[];
    sourceModified?: boolean;
    authoredPath?: string;
}

export interface ISetBreakpointsArgs extends DebugProtocol.SetBreakpointsArguments {
    authoredPath?: string;
}

// TODO DIEGO: Finish implementing this file

export interface IBreakpointRecipie<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, Behavior extends IBehaviorRecipie = IBehaviorRecipie> {
    readonly locationInResource: LocationInResource<TResource>;
    readonly behavior: Behavior;
}

abstract class BreakpointRecipieCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, Behavior extends IBehaviorRecipie = IBehaviorRecipie> {
    constructor(
        public readonly locationInResource: LocationInResource<TResource>,
        public readonly behavior: Behavior) { }
}

export class BPRecipieInLoadedSource<BehaviorRecipie extends IBehaviorRecipie = IBehaviorRecipie>
    extends BreakpointRecipieCommonLogic<ILoadedSource, BehaviorRecipie> implements IBreakpointRecipie<ILoadedSource, BehaviorRecipie> {
    public asBPInScriptRecipie(): BreakpointRecipieInScript<BehaviorRecipie> {
        return new BreakpointRecipieInScript<BehaviorRecipie>(this.locationInResource.asLocationInScript(), this.behavior);
    }
}

export class BreakpointRecipieInUnbindedSource<BehaviorRecipie extends IBehaviorRecipie = IBehaviorRecipie> extends BreakpointRecipieCommonLogic<ISourceIdentifier, BehaviorRecipie> implements IBreakpointRecipie<ISourceIdentifier, BehaviorRecipie> {
    public tryGettingBreakpointInLoadedSource<R>(
        whenSuccesfulDo: (breakpointInLoadedSource: BPRecipieInLoadedSource) => R,
        whenFailedDo: (breakpointInUnbindedSource: BreakpointRecipieInUnbindedSource) => R): R {
        return this.locationInResource.tryGettingLocationInLoadedSource(
            locationInLoadedSource => whenSuccesfulDo(new BPRecipieInLoadedSource(locationInLoadedSource, this.behavior)),
            () => whenFailedDo(this));
    }

    public asBreakpointInLoadedSource(): BPRecipieInLoadedSource {
        return this.tryGettingBreakpointInLoadedSource(
            breakpointInLoadedSource => breakpointInLoadedSource,
            () => { throw new Error(`Failed to convert ${this} into a breakpoint in a loaded source`); });
    }
}

export type IBreakpointRecipieInLoadedSource = IBreakpointRecipie<ILoadedSource>;
export type IBreakpointRecipieInUnbindedSource = IBreakpointRecipie<ISourceIdentifier>;

export type BreakpointRecipie<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> =
    TResource extends ISourceIdentifier ? BreakpointRecipieInUnbindedSource :
    TResource extends ILoadedSource ? BPRecipieInLoadedSource :
    TResource extends IScript ? BreakpointRecipieInScript :
    TResource extends IResourceIdentifier ? BreakpointRecipieInUrl :
    TResource extends URLRegexp ? BreakpointRecipieInUrlRegexp :
    never;

export class BreakpointRecipieInScript<BehaviorRecipie extends IBehaviorRecipie = IBehaviorRecipie>
    extends BreakpointRecipieCommonLogic<IScript, BehaviorRecipie> implements IBreakpointRecipie<IScript, BehaviorRecipie> {

    public asBPInUrlRegexpRecipie(): BreakpointRecipieInUrlRegexp<BehaviorRecipie> {
        const urlRegexp = new URLRegexp(utils.pathToRegex(this.locationInResource.script.url));
        return new BreakpointRecipieInUrlRegexp<BehaviorRecipie>(new LocationInUrlRegexp(urlRegexp, this.locationInResource.location), this.behavior);
    }

    public asBPInUrlRecipie(): BreakpointRecipieInUrl<BehaviorRecipie> {
        const url = this.locationInResource.script.runtimeSource.identifier;
        return new BreakpointRecipieInUrl<BehaviorRecipie>(new LocationInUrl(url, this.locationInResource.location), this.behavior);
    }
}

export class BreakpointRecipieInUrl<BehaviorRecipie extends IBehaviorRecipie = IBehaviorRecipie>
    extends BreakpointRecipieCommonLogic<IResourceIdentifier, BehaviorRecipie> implements IBreakpointRecipie<IResourceIdentifier, BehaviorRecipie> {
}

export class BreakpointRecipieInUrlRegexp<BehaviorRecipie extends IBehaviorRecipie = IBehaviorRecipie>
    extends BreakpointRecipieCommonLogic<URLRegexp, BehaviorRecipie> implements IBreakpointRecipie<URLRegexp, BehaviorRecipie> {
}

export class URLRegexp {
    constructor(public readonly textRepresentation: string) { }
}