import { IScript } from '../internal/scripts/script';
import { CDTPScriptUrl } from '../internal/sources/resourceIdentifierSubtypes';
import { URLRegexp } from '../internal/locations/subtypes';
import { AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpActionWhenHit';
import { URL } from '../internal/sources/resourceIdentifier';
import { IBPRecipie } from '../internal/breakpoints/bpRecipie';

export type integer = number;
export type CDTPSupportedResources = IScript | URL<CDTPScriptUrl> | URLRegexp;
export type CDTPSupportedHitActions = AlwaysBreak | ConditionalBreak;
export type CDTPBPRecipie = IBPRecipie<CDTPSupportedResources>;