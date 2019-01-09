import { BPRecipieInScript, BPRecipieInUrl, BPRecipieInUrlRegexp, BPRecipie, IBPRecipie } from '../../internal/breakpoints/bpRecipie';
import { AlwaysBreak, ConditionalBreak } from '../../internal/breakpoints/bpActionWhenHit';
import { BreakpointInScript, BreakpointInUrl, BreakpointInUrlRegexp, Breakpoint } from '../../internal/breakpoints/breakpoint';
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
import { Coordinates } from '../../internal/locations/location';
import { singleOne } from '../../collections/utilities';
import { CDTPSupportedResources, CDTPSupportedHitActions } from '../cdtpPrimitives';

type SetBPInCDTPCall<TResource extends CDTPSupportedResources> = (resource: TResource, position: Coordinates, cdtpConditionField: string) => Promise<CDTP.Debugger.SetBreakpointByUrlResponse>;

export interface IDebuggeeBreakpoints {
    setBreakpoint(bpRecipie: BPRecipieInScript<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInScript>;
    setBreakpointByUrl(bpRecipie: BPRecipieInUrl<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInUrl[]>;
    setBreakpointByUrlRegexp(bpRecipie: BPRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInUrlRegexp[]>;
    getPossibleBreakpoints(rangeInScript: RangeInScript): Promise<LocationInScript[]>;
    removeBreakpoint(bpRecipie: BPRecipie<CDTPSupportedResources>): Promise<void>;
}

interface BreakpointClass<TResource extends CDTPSupportedResources> {
    new(recipie: IBPRecipie<TResource>, actualLocation: LocationInScript): Breakpoint<TResource>;
}

@injectable()
export class CDTPDebuggeeBreakpoints extends CDTPEventsEmitterDiagnosticsModule<CDTP.DebuggerApi, void, CDTP.Debugger.EnableResponse> implements IDebuggeeBreakpoints {
    protected readonly api = this.protocolApi.Debugger;

    private readonly _cdtpLocationParser = new CDTPLocationParser(this._scriptsRegistry);

    public readonly onBreakpointResolved = this.addApiListener('breakpointResolved', async (params: CDTP.Debugger.BreakpointResolvedEvent) => {
        const bpRecipie = this._breakpointIdRegistry.getRecipieByBreakpointId(params.breakpointId);
        const breakpoint = new Breakpoint(bpRecipie,
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
    }

    public async setBreakpoint(bpRecipie: BPRecipieInScript<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInScript> {
        const breakpoints = await this.setBreakpointHelper(BreakpointInScript, bpRecipie, async (_resource, _position, cdtpConditionField) => {
            const response = await this.api.setBreakpoint({ location: this.toCrdpLocation(bpRecipie.location), condition: cdtpConditionField });
            return { breakpointId: response.breakpointId, locations: [response.actualLocation] };
        });

        return singleOne(breakpoints);
    }

    public async setBreakpointByUrl(bpRecipie: BPRecipieInUrl<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInUrl[]> {
        return this.setBreakpointHelper(BreakpointInUrl, bpRecipie, (resource, position, cdtpConditionField) =>
            this.api.setBreakpointByUrl({
                url: resource.textRepresentation, lineNumber: position.lineNumber,
                columnNumber: position.columnNumber, condition: cdtpConditionField
            }));
    }

    public async setBreakpointByUrlRegexp(bpRecipie: BPRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInUrlRegexp[]> {
        return this.setBreakpointHelper(BreakpointInUrlRegexp, bpRecipie, (resource, position, cdtpConditionField) =>
            this.api.setBreakpointByUrl({
                urlRegex: resource, lineNumber: position.lineNumber,
                columnNumber: position.columnNumber, condition: cdtpConditionField
            }));
    }

    private async setBreakpointHelper<TResource extends CDTPSupportedResources, TBPActionWhenHit extends CDTPSupportedHitActions>
        (classToUse: BreakpointClass<TResource>, bpRecipie: IBPRecipie<TResource, TBPActionWhenHit>,
            setBPInCDTPCall: SetBPInCDTPCall<TResource>): Promise<Breakpoint<TResource>[]> {
        const cdtpConditionField = this.getCDTPConditionField(bpRecipie);
        const resource = <TResource>bpRecipie.location.resource; // TODO: Figure out why the <TResource> is needed and remove it
        const coordinates = bpRecipie.location.coordinates;

        const response = await setBPInCDTPCall(resource, coordinates, cdtpConditionField);

        /*
         * We need to call registerRecipie sync with the response, before any awaits so if we get an event with
         * a breakpointId we'll be able to resolve it properly
         */
        this._breakpointIdRegistry.registerRecipie(response.breakpointId, bpRecipie);

        return Promise.all(response.locations.map(cdtpLocation => this.toBreakpoinInResource(classToUse, bpRecipie, cdtpLocation)));
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

    private getCDTPConditionField(bpRecipie: IBPRecipie<CDTPSupportedResources, AlwaysBreak | ConditionalBreak>): string | undefined {
        return bpRecipie.bpActionWhenHit.basedOnTypeDo({
            alwaysBreak: () => undefined,
            conditionalBreak: conditionalBreak => conditionalBreak.expressionOfWhenToBreak
        });
    }

    private async toBreakpoinInResource<TResource extends CDTPSupportedResources>(classToUse: BreakpointClass<TResource>,
        bpRecipie: IBPRecipie<TResource>, actualLocation: CDTP.Debugger.Location): Promise<Breakpoint<TResource>> {
        const breakpoint = new classToUse(bpRecipie, await this.toLocationInScript(actualLocation));
        return breakpoint;
    }

    private toCrdpLocation(location: LocationInScript): CDTP.Debugger.Location {
        return {
            scriptId: this._scriptsRegistry.getCdtpId(location.script),
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber
        };
    }

    public toLocationInScript(location: CDTP.Debugger.Location): Promise<LocationInScript> {
        return this._cdtpLocationParser.getLocationInScript(location);
    }
}
