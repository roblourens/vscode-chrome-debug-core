import { IRequestedSourceIdentifier } from '../sourceIdentifier';
import { LocationInResource, ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInUrl, LocationInUrlRegexp } from '../locationInResource';
import { ILoadedSource } from '../loadedSource';
import { IScript } from '../script';
import { IBPBehavior } from './bpBehavior';
import { IResourceIdentifier } from '../resourceIdentifier';
import { utils } from '../../..';

export interface IBPRecipie<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, Behavior extends IBPBehavior = IBPBehavior> {
    readonly locationInResource: LocationInResource<TResource>;
    readonly behavior: Behavior;

    readonly unmappedBpRecipie: IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>; // Original bpRecipie before any mapping was done
}

abstract class BreakpointRecipieCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, BehaviorRecipie extends IBPBehavior = IBPBehavior> {
    public abstract get behavior(): BehaviorRecipie;

    constructor(
        public readonly locationInResource: LocationInResource<TResource>) { }

    public toString(): string {
        return `BP @ ${this.locationInResource} do: ${this.behavior}`;
    }
}

abstract class UnamppedBreakpointRecipieCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends BreakpointRecipieCommonLogic<TResource, BehaviorRecipie> {

    public get unmappedBpRecipie(): IBPRecipie<TResource, BehaviorRecipie> {
        return this;
    }

    constructor(
        locationInResource: LocationInResource<TResource>,
        public readonly behavior: BehaviorRecipie) {
        super(locationInResource);
    }
}

export class BPRecipieInLoadedSource<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends UnamppedBreakpointRecipieCommonLogic<ILoadedSource, BehaviorRecipie> implements IBPRecipie<ILoadedSource, BehaviorRecipie> {

    public asBPInScriptRecipie(): BreakpointRecipieInScript<BehaviorRecipie> {
        return new BreakpointRecipieInScript<BehaviorRecipie>(this, this.locationInResource.asLocationInScript());
    }

}

abstract class MappedBreakpointRecipieCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp, BehaviorRecipie extends IBPBehavior = IBPBehavior> {
    public get behavior(): BehaviorRecipie {
        return this.unmappedBpRecipie.behavior;
    }

    constructor(public readonly unmappedBpRecipie: IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp, BehaviorRecipie>,
        public readonly locationInResource: LocationInResource<TResource>) { }

    public toString(): string {
        return `BP @ ${this.locationInResource} do: ${this.behavior}`;
    }
}

export class BPRecipieInUnbindedSource<BehaviorRecipie extends IBPBehavior = IBPBehavior> extends UnamppedBreakpointRecipieCommonLogic<IRequestedSourceIdentifier, BehaviorRecipie> implements IBPRecipie<IRequestedSourceIdentifier, BehaviorRecipie> {
    public tryGettingBreakpointInLoadedSource<R>(
        whenSuccesfulDo: (breakpointInLoadedSource: BPRecipieInLoadedSource) => R,
        whenFailedDo: (breakpointInUnbindedSource: BPRecipieInUnbindedSource) => R): R {
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
export type IBreakpointRecipieInUnbindedSource = IBPRecipie<IRequestedSourceIdentifier>;

export type BPRecipie<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> =
    TResource extends IRequestedSourceIdentifier ? BPRecipieInUnbindedSource :
    TResource extends ILoadedSource ? BPRecipieInLoadedSource :
    TResource extends IScript ? BreakpointRecipieInScript :
    TResource extends IResourceIdentifier ? BreakpointRecipieInUrl :
    TResource extends URLRegexp ? BreakpointRecipieInUrlRegexp :
    never;

export class BreakpointRecipieInScript<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends MappedBreakpointRecipieCommonLogic<IScript, BehaviorRecipie> implements IBPRecipie<IScript, BehaviorRecipie> {

    public asBPInUrlRegexpRecipie(): BreakpointRecipieInUrlRegexp<BehaviorRecipie> {
        const urlRegexp = new URLRegexp(utils.pathToRegex(this.locationInResource.script.url));
        return new BreakpointRecipieInUrlRegexp<BehaviorRecipie>(this.unmappedBpRecipie,
            new LocationInUrlRegexp(urlRegexp, this.locationInResource.location));
    }

    public asBPInUrlRecipie(): BreakpointRecipieInUrl<BehaviorRecipie> {
        const url = this.locationInResource.script.runtimeSource.identifier;
        return new BreakpointRecipieInUrl<BehaviorRecipie>(this.unmappedBpRecipie,
            new LocationInUrl(url, this.locationInResource.location));
    }
}

export class BreakpointRecipieInUrl<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends MappedBreakpointRecipieCommonLogic<IResourceIdentifier, BehaviorRecipie> implements IBPRecipie<IResourceIdentifier, BehaviorRecipie> {
}

export class BreakpointRecipieInUrlRegexp<BehaviorRecipie extends IBPBehavior = IBPBehavior>
    extends MappedBreakpointRecipieCommonLogic<URLRegexp, BehaviorRecipie> implements IBPRecipie<URLRegexp, BehaviorRecipie> {
}

export class URLRegexp {
    constructor(public readonly textRepresentation: string) { }

    public toString(): string {
        return `BP @ ${this.textRepresentation}`;
    }
}