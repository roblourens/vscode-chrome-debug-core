/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { LocationInScript, LocationInLoadedSource } from '../locations/location';
import { IScript } from '../scripts/script';
import { URLRegexp } from '../locations/subtypes';
import { IResourceIdentifier } from '../sources/resourceIdentifier';
import { CDTPScriptUrl } from '../sources/resourceIdentifierSubtypes';
import { CDTPSupportedResources, CDTPSupportedHitActions } from '../../cdtpDebuggee/cdtpPrimitives';
import { ISource } from '../sources/source';
import { IMappedBPRecipie } from './baseMappedBPRecipie';
import { BPRecipieInSource } from './bpRecipieInSource';
import { IBPRecipie } from './bpRecipie';

export type BPPossibleResources = IScript | ISource | URLRegexp | IResourceIdentifier<CDTPScriptUrl>;
export type ActualLocation<TResource> =
    TResource extends IScript ? LocationInScript :
    TResource extends URLRegexp ? LocationInScript :
    TResource extends IResourceIdentifier<CDTPScriptUrl> ? LocationInScript :
    TResource extends ISource ? LocationInLoadedSource :
    LocationInScript;

/// We use the breakpoint class when the debugger actually configures a file to stop (or do something) at a certain place under certain conditions
export interface IBreakpoint<TResource extends BPPossibleResources> {
    readonly recipie: IBPRecipie<TResource>;
    readonly actualLocation: ActualLocation<TResource>;
}

abstract class BaseBreakpoint<TResource extends BPPossibleResources> implements IBreakpoint<TResource> {
    public abstract get recipie(): IBPRecipie<TResource>;
    public abstract get actualLocation(): ActualLocation<TResource>;

    public toString(): string {
        return `${this.recipie} actual location is ${this.actualLocation}`;
    }
}

export class MappableBreakpoint<TResource extends CDTPSupportedResources> extends BaseBreakpoint<TResource> {
    public mappedToSource(): BreakpointInSource {
        return new BreakpointInSource(this.recipie.unmappedBPRecipie, this.actualLocation.mappedToSource());
    }

    constructor(public readonly recipie: IMappedBPRecipie<TResource, CDTPSupportedHitActions>, public readonly actualLocation: ActualLocation<TResource>) {
        super();
    }
}

export class BreakpointInSource extends BaseBreakpoint<ISource> {
    constructor(public readonly recipie: BPRecipieInSource, public readonly actualLocation: ActualLocation<ISource>) {
        super();
    }
}
