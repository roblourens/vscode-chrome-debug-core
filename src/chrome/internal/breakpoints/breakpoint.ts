/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { LocationInScript, ScriptOrSourceOrURLOrURLRegexp } from '../locations/location';
import { IBPRecipie } from './bpRecipie';
import { ILoadedSource } from '../sources/loadedSource';
import { IScript } from '../scripts/script';
import { IURL } from '../sources/resourceIdentifier';
import { CDTPScriptUrl } from '../sources/resourceIdentifierSubtypes';
import { URLRegexp } from '../locations/subtypes';

// Should we rename this to ActionPoint? Given that it can be a LogPoint too?
export interface IBreakpoint<TResource extends ScriptOrSourceOrURLOrURLRegexp> {
    readonly recipie: IBPRecipie<TResource>;
    readonly actualLocation: LocationInScript;
}

export class Breakpoint<TResource extends ScriptOrSourceOrURLOrURLRegexp> implements IBreakpoint<TResource>{
    public toString(): string {
        return `${this.recipie} actual location is ${this.actualLocation}`;
    }

    constructor(public readonly recipie: IBPRecipie<TResource>, public readonly actualLocation: LocationInScript) { }
}

export class BreakpointInLoadedSource extends Breakpoint<ILoadedSource> { }

export class BreakpointInScript extends Breakpoint<IScript> { }

export class BreakpointInUrl extends Breakpoint<IURL<CDTPScriptUrl>> { }

export class BreakpointInUrlRegexp extends Breakpoint<URLRegexp> { }

// export type Breakpoint<TResource> =
//     TResource extends ILoadedSource ? BreakpointInLoadedSource :
//     TResource extends IScript ? BreakpointInScript :
//     TResource extends IResourceIdentifier ? BreakpointInUrl :
//     TResource extends URLRegexp ? BreakpointInUrlRegexp :
//     never;
