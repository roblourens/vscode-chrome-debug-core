/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { IScript } from '../internal/scripts/script';
import { CDTPScriptUrl } from '../internal/sources/resourceIdentifierSubtypes';
import { URLRegexp } from '../internal/locations/subtypes';
import { AlwaysPause, ConditionalPause } from '../internal/breakpoints/bpActionWhenHit';
import { IResourceIdentifier } from '../internal/sources/resourceIdentifier';
import { IBPRecipie } from '../internal/breakpoints/bpRecipie';
import { MappableBreakpoint } from '../internal/breakpoints/breakpoint';

export type integer = number;
// The IResourceIdentifier<CDTPScriptUrl> is used with the URL that is associated with each Script in CDTP. This should be a URL, but it could also be a string that is not a valid URL
// For that reason we use IResourceIdentifier<CDTPScriptUrl> for this type, instead of IURL<CDTPScriptUrl>
export type CDTPSupportedResources = IScript | IResourceIdentifier<CDTPScriptUrl> | URLRegexp;
export type CDTPSupportedHitActions = AlwaysPause | ConditionalPause;
export type CDTPBPRecipie = IBPRecipie<CDTPSupportedResources>;
export type CDTPBreakpoint = MappableBreakpoint<CDTPSupportedResources>;
