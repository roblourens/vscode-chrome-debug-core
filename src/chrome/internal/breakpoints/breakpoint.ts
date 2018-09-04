import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';
import { BPRecipie, URLRegexp } from './bpRecipie';
import { ILoadedSource } from '../loadedSource';
import { IScript } from '../script';
import { IResourceIdentifier } from '../resourceIdentifier';

// Should we rename this to ActionPoint? Given that it can be a LogPoint too?
export interface IBreakpoint<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> {
    recipie: BPRecipie<TResource>;
    actualLocation: LocationInScript;
}

export class Breakpoint<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> implements IBreakpoint<TResource>{
    public toString(): string {
        return `${this.recipie} actual location is ${this.actualLocation}`;
    }

    constructor(public readonly recipie: BPRecipie<TResource>, public readonly actualLocation: LocationInScript) { }
}

export class BreakpointInLoadedSource extends Breakpoint<ILoadedSource> { }

export class BreakpointInScript extends Breakpoint<IScript> { }

export class BreakpointInUrl extends Breakpoint<IResourceIdentifier> { }

export class BreakpointInUrlRegexp extends Breakpoint<URLRegexp> { }

// export type Breakpoint<TResource> =
//     TResource extends ILoadedSource ? BreakpointInLoadedSource :
//     TResource extends IScript ? BreakpointInScript :
//     TResource extends IResourceIdentifier ? BreakpointInUrl :
//     TResource extends URLRegexp ? BreakpointInUrlRegexp :
//     never;
