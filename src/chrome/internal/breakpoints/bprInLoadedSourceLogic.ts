import { Target } from '../../communication/targetChannels';
import { BPRecipieInLoadedSource, BPRecipie } from './bpRecipie';
import { ConditionalBreak, AlwaysBreak } from './bpBehavior';
import { IBreakpoint } from './breakpoint';
import { ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInScript, ZeroBasedLocation } from '../locations/locationInResource';
import { IRequestedSourceIdentifier } from '../sources/sourceIdentifier';
import { Communicator } from '../../communication/communicator';
import { chromeUtils, logger } from '../../..';
import { ColumnNumber, LineNumber } from '../locations/subtypes';
import { RangeInScript } from '../locations/rangeInScript';
import { BreakpointsRegistry } from './breakpointsRegistry';

export class BPRInLoadedSourceLogic {
    private readonly targetDebuggerSetBreakpoint = this._communicator.getRequester(Target.Debugger.SetBreakpoint);
    private readonly targetDebuggerSetBreakpointByUrl = this._communicator.getRequester(Target.Debugger.SetBreakpointByUrl);
    private readonly targetDebuggerSetBreakpointByUrlRegexp = this._communicator.getRequester(Target.Debugger.SetBreakpointByUrlRegexp);
    private readonly targetDebuggerRemoveBreakpoint = this._communicator.getRequester(Target.Debugger.RemoveBreakpoint);
    private readonly targetDebuggerGetPossibleBreakpoints = this._communicator.getRequester(Target.Debugger.GetPossibleBreakpoints);

    public async addBreakpoint(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[]> {
        const bpInScriptRecipie = bpRecipie.asBPInScriptRecipie();
        const bestLocation = await this.considerColumnAndSelectBestBPLocation(bpInScriptRecipie.locationInResource);
        const bpRecipieInBestLocation = bpInScriptRecipie.atLocation(bestLocation);

        const runtimeSource = bpInScriptRecipie.locationInResource.script.runtimeSource;
        this._breakpointRegistry.registerBPRecipie(bpRecipie);

        let breakpoints: IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[];
        if (!runtimeSource.doesScriptHasUrl()) {
            breakpoints = [await this.targetDebuggerSetBreakpoint(bpRecipieInBestLocation)];
        } else if (runtimeSource.identifier.isLocalFilePath()) {
            breakpoints = await this.targetDebuggerSetBreakpointByUrlRegexp(bpRecipieInBestLocation.asBPInUrlRegexpRecipie());
        } else { // The script has a URL and it's not a local file path, so we can leave it as-is
            breakpoints = await this.targetDebuggerSetBreakpointByUrl(bpRecipieInBestLocation.asBPInUrlRecipie());
        }

        breakpoints.forEach(breakpoint => this._breakpointRegistry.registerBreakpointAsBinded(breakpoint));
        return breakpoints;
    }

    public removeBreakpoint(bpRecipie: BPRecipie<IRequestedSourceIdentifier>): Promise<void> {
        return this.targetDebuggerRemoveBreakpoint(bpRecipie);
    }

    private async considerColumnAndSelectBestBPLocation(location: LocationInScript): Promise<LocationInScript> {
        if (await this._columnBreakpointsEnabled) {
            const thisLineStart = new ZeroBasedLocation(location.location.lineNumber, 0 as ColumnNumber);
            const nextLineStart = new ZeroBasedLocation((location.location.lineNumber + 1) as LineNumber, 0 as ColumnNumber);
            const thisLineRange = new RangeInScript(location.script, thisLineStart, nextLineStart);

            const possibleLocations = await this.targetDebuggerGetPossibleBreakpoints(thisLineRange);

            if (possibleLocations.length > 0) {
                const bestLocation = chromeUtils.selectBreakpointLocation(location.lineNumber, location.columnNumber, possibleLocations);
                logger.verbose(`PossibleBreakpoints: Best location for ${location} is ${bestLocation}`);
                return bestLocation;
            }
        }

        return location;
    }

    constructor(
        private readonly _communicator: Communicator,
        private readonly _breakpointRegistry: BreakpointsRegistry,
        private readonly _columnBreakpointsEnabled: Promise<boolean>) {
    }
}