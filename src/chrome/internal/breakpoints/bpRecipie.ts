import { ISourceIdentifier } from '../sourceIdentifier';
import { LocationInResource, ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInUrl, LocationInUrlRegexp } from '../locationInResource';
import { ILoadedSource } from '../loadedSource';
import { IScript } from '../script';
import { IBPBehavior } from './bpBehavior';
import { IResourceIdentifier } from '../resourceIdentifier';
import { utils } from '../../..';

export interface IBPRecipie<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, Behavior extends IBPBehavior = IBPBehavior> {
    readonly locationInResource: LocationInResource<TResource>;
    readonly behavior: Behavior;
}

abstract class BreakpointRecipieCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, Behavior extends IBPBehavior = IBPBehavior> {
    constructor(
        public readonly locationInResource: LocationInResource<TResource>,
        public readonly behavior: Behavior) { }

    public toString(): string {
        return `BP @ ${this.locationInResource} do: ${this.behavior}`;
    }
}

export class BPRecipieInLoadedSource<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends BreakpointRecipieCommonLogic<ILoadedSource, BehaviorRecipie> implements IBPRecipie<ILoadedSource, BehaviorRecipie> {
    public asBPInScriptRecipie(): BreakpointRecipieInScript<BehaviorRecipie> {
        return new BreakpointRecipieInScript<BehaviorRecipie>(this.locationInResource.asLocationInScript(), this.behavior);
    }
}

export class BreakpointRecipieInUnbindedSource<BehaviorRecipie extends IBPBehavior = IBPBehavior> extends BreakpointRecipieCommonLogic<ISourceIdentifier, BehaviorRecipie> implements IBPRecipie<ISourceIdentifier, BehaviorRecipie> {
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

export type IBreakpointRecipieInLoadedSource = IBPRecipie<ILoadedSource>;
export type IBreakpointRecipieInUnbindedSource = IBPRecipie<ISourceIdentifier>;

export type BPRecipie<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> =
    TResource extends ISourceIdentifier ? BreakpointRecipieInUnbindedSource :
    TResource extends ILoadedSource ? BPRecipieInLoadedSource :
    TResource extends IScript ? BreakpointRecipieInScript :
    TResource extends IResourceIdentifier ? BreakpointRecipieInUrl :
    TResource extends URLRegexp ? BreakpointRecipieInUrlRegexp :
    never;

export class BreakpointRecipieInScript<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends BreakpointRecipieCommonLogic<IScript, BehaviorRecipie> implements IBPRecipie<IScript, BehaviorRecipie> {

    public asBPInUrlRegexpRecipie(): BreakpointRecipieInUrlRegexp<BehaviorRecipie> {
        const urlRegexp = new URLRegexp(utils.pathToRegex(this.locationInResource.script.url));
        return new BreakpointRecipieInUrlRegexp<BehaviorRecipie>(new LocationInUrlRegexp(urlRegexp, this.locationInResource.location), this.behavior);
    }

    public asBPInUrlRecipie(): BreakpointRecipieInUrl<BehaviorRecipie> {
        const url = this.locationInResource.script.runtimeSource.identifier;
        return new BreakpointRecipieInUrl<BehaviorRecipie>(new LocationInUrl(url, this.locationInResource.location), this.behavior);
    }
}

export class BreakpointRecipieInUrl<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends BreakpointRecipieCommonLogic<IResourceIdentifier, BehaviorRecipie> implements IBPRecipie<IResourceIdentifier, BehaviorRecipie> {
}

export class BreakpointRecipieInUrlRegexp<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends BreakpointRecipieCommonLogic<URLRegexp, BehaviorRecipie> implements IBPRecipie<URLRegexp, BehaviorRecipie> {
}

export class URLRegexp {
    constructor(public readonly textRepresentation: string) { }

    public toString(): string {
        return `BP @ ${this.textRepresentation}`;
    }
}