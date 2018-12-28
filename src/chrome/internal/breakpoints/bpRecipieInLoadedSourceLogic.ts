import { BPRecipieInLoadedSource, BPRecipie } from './bpRecipie';
import { ConditionalBreak, AlwaysBreak } from './bpActionWhenHit';
import { IBreakpoint } from './breakpoint';
import { ScriptOrSourceOrUrlRegexp, LocationInScript, Coordinates } from '../locations/location';
import { IUnresolvedSource } from '../sources/unresolvedSource';
import { chromeUtils, logger } from '../../..';
import { ColumnNumber, LineNumber } from '../locations/subtypes';
import { RangeInScript } from '../locations/rangeInScript';
import { BreakpointsRegistry } from './breakpointsRegistry';
import { PausedEvent } from '../../target/events';
import { VoteRelevance, Vote, Abstained } from '../../communication/collaborativeDecision';
import { inject, injectable } from 'inversify';
import { ITargetBreakpoints } from '../../target/cdtpTargetBreakpoints';
import { IBreakpointFeaturesSupport } from '../../target/breakpointFeaturesSupport';
import { TYPES } from '../../dependencyInjection.ts/types';
import { InformationAboutPausedProvider, NotifyStoppedCommonLogic } from '../features/takeProperActionOnPausedEvent';
import { IEventsToClientReporter } from '../../client/eventSender';
import { ReasonType } from '../../stoppedEvent';

export type Dummy = VoteRelevance; // If we don't do this the .d.ts doesn't include VoteRelevance and the compilation fails. Remove this when the issue disappears...

export class HitBreakpoint extends NotifyStoppedCommonLogic {
    public readonly relevance = VoteRelevance.NormalVote;
    protected reason: ReasonType = 'breakpoint';

    constructor(protected readonly _eventsToClientReporter: IEventsToClientReporter,
        protected readonly _publishGoingToPauseClient: () => void) {
        super();
    }
}

export interface IBreakpointsInLoadedSource {
    addBreakpointForLoadedSource(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrUrlRegexp>[]>;
}

export interface BPRecipieInLoadedSourceLogicDependencies {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    publishGoingToPauseClient(): void;
}

@injectable()
export class BPRecipieInLoadedSourceLogic implements IBreakpointsInLoadedSource {
    private readonly doesTargetSupportColumnBreakpointsCached: Promise<boolean>;

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<Vote<void>> {
        if (paused.hitBreakpoints && paused.hitBreakpoints.length > 0) {
            // TODO DIEGO: Improve this to consider breakpoints where we shouldn't pause
            return new HitBreakpoint(this._eventsToClientReporter,
                // () => this._dependencies.publishGoingToPauseClient() TODO Figure out if we need this for the Chrome Overlay
                () => { });
        } else {
            return new Abstained(this);
        }
    }

    public async addBreakpointForLoadedSource(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrUrlRegexp>[]> {
        const bpInScriptRecipie = bpRecipie.asBPInScriptRecipie();
        const bestLocation = await this.considerColumnAndSelectBestBPLocation(bpInScriptRecipie.location);
        const bpRecipieInBestLocation = bpInScriptRecipie.atLocation(bestLocation);

        const runtimeSource = bpInScriptRecipie.location.script.runtimeSource;
        this._breakpointRegistry.registerBPRecipie(bpRecipie);

        let breakpoints: IBreakpoint<ScriptOrSourceOrUrlRegexp>[];
        if (!runtimeSource.doesScriptHasUrl()) {
            breakpoints = [await this._targetBreakpoints.setBreakpoint(bpRecipieInBestLocation)];
        } else if (runtimeSource.identifier.isLocalFilePath()) {
            breakpoints = await this._targetBreakpoints.setBreakpointByUrlRegexp(bpRecipieInBestLocation.asBPInUrlRegexpRecipie());
        } else { // The script has a URL and it's not a local file path, so we can leave it as-is
            breakpoints = await this._targetBreakpoints.setBreakpointByUrl(bpRecipieInBestLocation.asBPInUrlRecipie());
        }

        breakpoints.forEach(breakpoint => this._breakpointRegistry.registerBreakpointAsBinded(breakpoint));
        return breakpoints;
    }

    public removeBreakpoint(bpRecipie: BPRecipie<IUnresolvedSource>): Promise<void> {
        return this._targetBreakpoints.removeBreakpoint(bpRecipie);
    }

    private async considerColumnAndSelectBestBPLocation(location: LocationInScript): Promise<LocationInScript> {
        if (await this.doesTargetSupportColumnBreakpointsCached) {
            const thisLineStart = new Coordinates(location.coordinates.lineNumber, 0 as ColumnNumber);
            const nextLineStart = new Coordinates((location.coordinates.lineNumber + 1) as LineNumber, 0 as ColumnNumber);
            const thisLineRange = new RangeInScript(location.script, thisLineStart, nextLineStart);

            const possibleLocations = await this._targetBreakpoints.getPossibleBreakpoints(thisLineRange);

            if (possibleLocations.length > 0) {
                const bestLocation = chromeUtils.selectBreakpointLocation(location.lineNumber, location.columnNumber, possibleLocations);
                logger.verbose(`PossibleBreakpoints: Best location for ${location} is ${bestLocation}`);
                return bestLocation;
            }
        }

        return location;
    }

    public install(): this {
        this._dependencies.subscriberForAskForInformationAboutPaused(params => this.askForInformationAboutPaused(params));
        return this;
    }

    constructor(
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: BPRecipieInLoadedSourceLogicDependencies,
        @inject(TYPES.IBreakpointFeaturesSupport) private readonly _breakpointFeaturesSupport: IBreakpointFeaturesSupport,
        private readonly _breakpointRegistry: BreakpointsRegistry,
        @inject(TYPES.ITargetBreakpoints) private readonly _targetBreakpoints: ITargetBreakpoints,
        @inject(TYPES.IEventsToClientReporter) private readonly _eventsToClientReporter: IEventsToClientReporter) {
        this.doesTargetSupportColumnBreakpointsCached = this._breakpointFeaturesSupport.supportsColumnBreakpoints;
    }
}