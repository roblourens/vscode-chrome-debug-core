/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { LocationInScript, LocationInLoadedSource } from '../locations/location';
import { IBPRecipie } from './bpRecipie';
import { IScript } from '../scripts/script';
import { URLRegexp } from '../locations/subtypes';
import { IResourceIdentifier } from '../sources/resourceIdentifier';
import { CDTPScriptUrl } from '../sources/resourceIdentifierSubtypes';
import { CDTPSupportedResources } from '../../cdtpDebuggee/cdtpPrimitives';
import { ISource } from '../sources/source';

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

export abstract class BaseBreakpoint<TResource extends BPPossibleResources> implements IBreakpoint<TResource>{
    public toString(): string {
        return `${this.recipie} actual location is ${this.actualLocation}`;
    }

    constructor(public readonly recipie: IBPRecipie<TResource>, public readonly actualLocation: ActualLocation<TResource>) { }
}

export class MappableBreakpoint<TResource extends CDTPSupportedResources> extends BaseBreakpoint<TResource> {
    public mappedToSource(): BreakpointInSource {
        return new BreakpointInSource(this.recipie.unmappedBPRecipie, this.actualLocation.mappedToSource());
    }
}

export class BreakpointInSource extends BaseBreakpoint<ISource> { }
