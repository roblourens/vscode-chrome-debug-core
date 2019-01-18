/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ISource } from '../sources/source';
import { Location, ScriptOrSourceOrURLOrURLRegexp } from '../locations/location';
import { ILoadedSource } from '../sources/loadedSource';
import { IScript } from '../scripts/script';
import { IBPActionWhenHit } from './bpActionWhenHit';
import { IResourceIdentifier } from '../sources/resourceIdentifier';
import { URLRegexp } from '../locations/subtypes';
import { IEquivalenceComparable } from '../../utils/equivalence';
import { BPRecipieInLoadedSource, BPRecipieInScript, BPRecipieInUrl, BPRecipieInUrlRegexp } from './baseMappedBPRecipie';
import { BPRecipieInSource } from './bpRecipieInSource';

/**
 * IBPRecipie represents the instruction to set a breakpoint with some particular properties. Assuming that IBPRecipie ends up creating an actual
 * breakpoint in the debuggee, an instance of Breakpoint will be created to represent that actual breakpoint.
 */
export interface IBPRecipie<TResource extends ScriptOrSourceOrURLOrURLRegexp, TBPActionWhenHit extends IBPActionWhenHit = IBPActionWhenHit>
    extends IEquivalenceComparable {
    readonly location: Location<TResource>;
    readonly bpActionWhenHit: TBPActionWhenHit;

    readonly unmappedBPRecipie: BPRecipie<ISource>; // We store the original bpRecipie before any mapping was done, to make it easier to send updates of the status to the client
}

export abstract class BaseBPRecipie<TResource extends ScriptOrSourceOrURLOrURLRegexp, TBPActionWhenHit extends IBPActionWhenHit = IBPActionWhenHit> implements IBPRecipie<TResource, TBPActionWhenHit> {
    public abstract get unmappedBPRecipie(): BPRecipieInSource<IBPActionWhenHit>;
    public abstract get bpActionWhenHit(): TBPActionWhenHit;
    public abstract get location(): Location<TResource>;
    public abstract isEquivalentTo(right: this): boolean;

    public toString(): string {
        return `BP @ ${this.location} do: ${this.bpActionWhenHit}`;
    }
}

export type BPRecipie<TResource extends ScriptOrSourceOrURLOrURLRegexp, TBPActionWhenHit extends IBPActionWhenHit = IBPActionWhenHit> = IBPRecipie<TResource, TBPActionWhenHit> & (
    TResource extends ISource ? BPRecipieInSource :
    TResource extends ILoadedSource ? BPRecipieInLoadedSource :
    TResource extends IScript ? BPRecipieInScript :
    TResource extends IResourceIdentifier ? BPRecipieInUrl :
    TResource extends URLRegexp ? BPRecipieInUrlRegexp :
    never);
