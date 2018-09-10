import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInLoadedSource } from '../locationInResource';
import { IScript } from '../script';
import { BreakpointRecipie, URLRegexp, IBreakpointRecipie } from './breakpointRecipie';
import { IResourceIdentifier } from '../resourceIdentifier';
import { ILoadedSource } from '../loadedSource';

export interface IBreakpoint<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> {
    recipie: BreakpointRecipie<TResource>;
    actualLocation: LocationInScript;
}

export abstract class BreakpointCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> implements IBreakpoint<TResource>{
    constructor(public readonly recipie: BreakpointRecipie<TResource>, public readonly actualLocation: LocationInScript) { }
}

export class BreakpointInLoadedSource extends BreakpointCommonLogic<ILoadedSource> {

}

export class BreakpointInScript extends BreakpointCommonLogic<IScript> {

}

export class BreakpointInUrl extends BreakpointCommonLogic<IResourceIdentifier> {

}

export class BreakpointInUrlRegexp extends BreakpointCommonLogic<URLRegexp> {

}

export type Breakpoint<TResource> =
    TResource extends ILoadedSource ? BreakpointInLoadedSource :
    TResource extends IScript ? BreakpointInScript :
    TResource extends IResourceIdentifier ? BreakpointInUrl :
    TResource extends URLRegexp ? BreakpointInUrlRegexp :
    never;

export interface IBPRecipieStatus {
    statusDescription: string;
    recipie: IBreakpointRecipie<ILoadedSource>;

    isVerified(): boolean;
}

export class BPRecipieIsUnbinded implements IBPRecipieStatus {
    public isVerified(): boolean {
        return false;
    }

    constructor(
        public readonly recipie: IBreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>,
        public readonly statusDescription: string) {
    }
}

export class BPRecipieIsBinded implements IBPRecipieStatus {
    public get actualLocationInSource(): LocationInLoadedSource {
        // TODO: Figure out what is the right way to decide the actual location when we have multiple breakpoints
        return this.breakpoints[0].actualLocation.asLocationInLoadedSource();
    }

    public isVerified(): boolean {
        return true;
    }

    constructor(
        public readonly recipie: IBreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>,
        public readonly breakpoints: IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[],
        public readonly statusDescription: string) {
        if (this.breakpoints.length === 0) {
            throw new Error(`A breakpoint recipie that is binded needs to have at least one breakpoint that was binded for the recipie yet ${this} had none`);
        }
    }
}