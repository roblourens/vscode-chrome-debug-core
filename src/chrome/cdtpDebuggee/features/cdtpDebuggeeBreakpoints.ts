/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { BPRecipie, IBPRecipie } from '../../internal/breakpoints/bpRecipie';
import { RangeInScript } from '../../internal/locations/rangeInScript';
import { LocationInScript } from '../../internal/locations/location';
import { Protocol as CDTP } from 'devtools-protocol';
import { TYPES } from '../../dependencyInjection.ts/types';
import { inject, injectable } from 'inversify';
import { CDTPBreakpointIdsRegistry } from '../registries/cdtpBreakpointIdsRegistry';
import { asyncMap } from '../../collections/async';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { CDTPLocationParser } from '../protocolParsers/cdtpLocationParser';
import { CDTPEventsEmitterDiagnosticsModule } from '../infrastructure/cdtpDiagnosticsModule';
import { CDTPDomainsEnabler } from '../infrastructure/cdtpDomainsEnabler';
import { Position } from '../../internal/locations/location';
import { singleElementOfArray } from '../../collections/utilities';
import { CDTPSupportedResources, CDTPSupportedHitActions, CDTPBreakpoint } from '../cdtpPrimitives';
import { Listeners } from '../../communication/listeners';
import { IScript } from '../../internal/scripts/script';
import { IURL, IResourceIdentifier } from '../../internal/sources/resourceIdentifier';
import { CDTPScriptUrl } from '../../internal/sources/resourceIdentifierSubtypes';
import { URLRegexp } from '../../internal/locations/subtypes';
import { MappableBreakpoint, ActualLocation } from '../../internal/breakpoints/breakpoint';
import { BPRecipieInScript, BPRecipieInUrl, BPRecipieInUrlRegexp, IMappedBPRecipie } from '../../internal/breakpoints/BaseMappedBPRecipie';
import { ConditionalPause } from '../../internal/breakpoints/bpActionWhenHit';

type SetBPInCDTPCall<TResource extends CDTPSupportedResources> = (resource: TResource, position: Position, cdtpConditionField: string) => Promise<CDTP.Debugger.SetBreakpointByUrlResponse>;
export type OnBreakpointResolvedListener = (breakpoint: CDTPBreakpoint) => void;

export interface IDebuggeeBreakpoints {
    setBreakpoint(bpRecipie: BPRecipieInScript): Promise<MappableBreakpoint<IScript>>;
    setBreakpointByUrl(bpRecipie: BPRecipieInUrl): Promise<MappableBreakpoint<IURL<CDTPScriptUrl>>[]>;
    setBreakpointByUrlRegexp(bpRecipie: BPRecipieInUrlRegexp): Promise<MappableBreakpoint<URLRegexp>[]>;
    getPossibleBreakpoints(rangeInScript: RangeInScript): Promise<LocationInScript[]>;
    removeBreakpoint(bpRecipie: IBPRecipie<CDTPSupportedResources>): Promise<void>;
    onBreakpointResolvedAsync(listener: OnBreakpointResolvedListener): void;
    onBreakpointResolvedSyncOrAsync(listener: OnBreakpointResolvedListener): void;
}

@injectable()
export class CDTPDebuggeeBreakpoints extends CDTPEventsEmitterDiagnosticsModule<CDTP.DebuggerApi, void, CDTP.Debugger.EnableResponse> implements IDebuggeeBreakpoints {
    protected readonly api = this.protocolApi.Debugger;

    private readonly _cdtpLocationParser = new CDTPLocationParser(this._scriptsRegistry);

    private readonly onBreakpointResolvedSyncOrAsyncListeners = new Listeners<CDTPBreakpoint, void>();

    public readonly onBreakpointResolvedAsync = this.addApiListener('breakpointResolved', async (params: CDTP.Debugger.BreakpointResolvedEvent) => {
        const bpRecipie = this._breakpointIdRegistry.getRecipieByBreakpointId(params.breakpointId);
        const breakpoint = new MappableBreakpoint(bpRecipie,
            await this.toLocationInScript(params.location));
        return breakpoint;
    });

    constructor(
        @inject(TYPES.CDTPClient) protected readonly protocolApi: CDTP.ProtocolApi,
        @inject(CDTPBreakpointIdsRegistry) private readonly _breakpointIdRegistry: CDTPBreakpointIdsRegistry,
        @inject(TYPES.CDTPScriptsRegistry) private readonly _scriptsRegistry: CDTPScriptsRegistry,
        @inject(TYPES.IDomainsEnabler) domainsEnabler: CDTPDomainsEnabler,
    ) {
        super(domainsEnabler);
        this.onBreakpointResolvedAsync(bp => this.onBreakpointResolvedSyncOrAsyncListeners.call(bp));
    }

    public onBreakpointResolvedSyncOrAsync(listener: (breakpoint: MappableBreakpoint<CDTPSupportedResources>) => void): void {
        this.onBreakpointResolvedSyncOrAsyncListeners.add(listener);
    }

    public async setBreakpoint(bpRecipie: BPRecipieInScript): Promise<MappableBreakpoint<IScript>> {
        const breakpoints = await this.setBreakpointHelper(bpRecipie, async (_resource, _position, cdtpConditionField) => {
            const response = await this.api.setBreakpoint({ location: this.toCrdpLocation(bpRecipie.location), condition: cdtpConditionField });
            return { breakpointId: response.breakpointId, locations: [response.actualLocation] };
        });

        return singleElementOfArray(breakpoints);
    }

    public async setBreakpointByUrl(bpRecipie: BPRecipieInUrl): Promise<MappableBreakpoint<IURL<CDTPScriptUrl>>[]> {
        return this.setBreakpointHelper(bpRecipie, (resource, position, cdtpConditionField) =>
            this.api.setBreakpointByUrl({
                url: resource.textRepresentation, lineNumber: position.lineNumber,
                columnNumber: position.columnNumber, condition: cdtpConditionField
            }));
    }

    public async setBreakpointByUrlRegexp(bpRecipie: BPRecipieInUrlRegexp): Promise<MappableBreakpoint<URLRegexp>[]> {
        return this.setBreakpointHelper(bpRecipie, (resource, position, cdtpConditionField) =>
            this.api.setBreakpointByUrl({
                urlRegex: resource, lineNumber: position.lineNumber,
                columnNumber: position.columnNumber, condition: cdtpConditionField
            }));
    }

    private async setBreakpointHelper<TResource extends IScript | IResourceIdentifier<CDTPScriptUrl> | URLRegexp, TBPActionWhenHit extends CDTPSupportedHitActions>
        (bpRecipie: IMappedBPRecipie<TResource, TBPActionWhenHit>,
            setBPInCDTPCall: SetBPInCDTPCall<TResource>): Promise<MappableBreakpoint<TResource>[]> {
        const cdtpConditionField = this.getCDTPConditionField(bpRecipie);
        const resource: TResource = bpRecipie.location.resource; // TODO: Figure out why the <TResource> is needed and remove it
        const position = bpRecipie.location.position;

        const response = await setBPInCDTPCall(resource, position, cdtpConditionField);

        /*
         * We need to call registerRecipie sync with the response, before any awaits so if we get an event with
         * a breakpointId we'll be able to resolve it properly
         */
        this._breakpointIdRegistry.registerRecipie(response.breakpointId, bpRecipie);

        const breakpoints = await Promise.all(response.locations.map(cdtpLocation => this.toBreakpoinInResource(bpRecipie, cdtpLocation)));
        breakpoints.forEach(bp => this.onBreakpointResolvedSyncOrAsyncListeners.call(bp));
        return breakpoints;
    }

    public async getPossibleBreakpoints(rangeInScript: RangeInScript): Promise<LocationInScript[]> {
        const response = await this.api.getPossibleBreakpoints({
            start: this.toCrdpLocation(rangeInScript.startInScript),
            end: this.toCrdpLocation(rangeInScript.endInScript)
        });

        return asyncMap(response.locations, async location => await this.toLocationInScript(location));
    }

    public async removeBreakpoint(bpRecipie: BPRecipie<CDTPSupportedResources>): Promise<void> {
        await this.api.removeBreakpoint({ breakpointId: this._breakpointIdRegistry.getBreakpointId(bpRecipie) });
        this._breakpointIdRegistry.unregisterRecipie(bpRecipie);
    }

    private getCDTPConditionField(bpRecipie: IBPRecipie<CDTPSupportedResources, CDTPSupportedHitActions>): string | undefined {
        return bpRecipie.bpActionWhenHit instanceof ConditionalPause
            ? bpRecipie.bpActionWhenHit.expressionOfWhenToPause
            : undefined;
    }

    private async toBreakpoinInResource<TResource extends CDTPSupportedResources>(bpRecipie: IMappedBPRecipie<TResource, CDTPSupportedHitActions>, actualLocation: CDTP.Debugger.Location): Promise<MappableBreakpoint<TResource>> {
        const breakpoint = new MappableBreakpoint<TResource>(bpRecipie, <ActualLocation<TResource>>await this.toLocationInScript(actualLocation));
        return breakpoint;
    }

    private toCrdpLocation(location: LocationInScript): CDTP.Debugger.Location {
        return {
            scriptId: this._scriptsRegistry.getCdtpId(location.script),
            lineNumber: location.position.lineNumber,
            columnNumber: location.position.columnNumber
        };
    }

    public toLocationInScript(location: CDTP.Debugger.Location): Promise<LocationInScript> {
        return this._cdtpLocationParser.getLocationInScript(location);
    }
}
