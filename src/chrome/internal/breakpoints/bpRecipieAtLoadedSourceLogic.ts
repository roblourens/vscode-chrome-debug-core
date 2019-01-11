import { BPRecipieInLoadedSource, BPRecipie } from './bpRecipie';
import { ConditionalBreak, AlwaysBreak } from './bpActionWhenHit';
import { IBreakpoint } from './breakpoint';
import { ScriptOrSourceOrURLOrURLRegexp, LocationInScript, Coordinates } from '../locations/location';
import { ISource } from '../sources/source';
import { chromeUtils, logger } from '../../..';
import { createColumnNumber, createLineNumber } from '../locations/subtypes';
import { RangeInScript } from '../locations/rangeInScript';
import { BreakpointsRegistry } from './breakpointsRegistry';
import { PausedEvent } from '../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { VoteRelevance, Vote, Abstained } from '../../communication/collaborativeDecision';
import { inject, injectable } from 'inversify';
import { IDebuggeeBreakpoints } from '../../cdtpDebuggee/features/cdtpDebuggeeBreakpoints';
import { IBreakpointFeaturesSupport } from '../../cdtpDebuggee/features/cdtpBreakpointFeaturesSupport';
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
    addBreakpointAtLoadedSource(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrURLOrURLRegexp>[]>;
}

export interface BPRecipieAtLoadedSourceLogicDependencies {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    publishGoingToPauseClient(): void;
}

@injectable()
export class BPRecipieAtLoadedSourceLogic implements IBreakpointsInLoadedSource {
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

    public async addBreakpointAtLoadedSource(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrURLOrURLRegexp>[]> {
        const bpInScriptRecipie = bpRecipie.mappedToScript();
        const bestLocation = await this.considerColumnAndSelectBestBPLocation(bpInScriptRecipie.location);
        const bpRecipieInBestLocation = bpInScriptRecipie.withLocationReplaced(bestLocation);

        const runtimeSource = bpInScriptRecipie.location.script.runtimeSource;
        this._breakpointRegistry.registerBPRecipie(bpRecipie);

        let breakpoints: IBreakpoint<ScriptOrSourceOrURLOrURLRegexp>[];
        if (!runtimeSource.doesScriptHasUrl()) {
            breakpoints = [await this._targetBreakpoints.setBreakpoint(bpRecipieInBestLocation)];
        } else if (runtimeSource.identifier.isLocalFilePath()) {
            breakpoints = await this._targetBreakpoints.setBreakpointByUrlRegexp(bpRecipieInBestLocation.mappedToUrlRegexp());
        } else { // The script has a URL and it's not a local file path, so we can leave it as-is
            breakpoints = await this._targetBreakpoints.setBreakpointByUrl(bpRecipieInBestLocation.mappedToUrl());
        }

        breakpoints.forEach(breakpoint => this._breakpointRegistry.registerBreakpointAsBinded(breakpoint));
        return breakpoints;
    }

    public async removeBreakpoint(_bpRecipie: BPRecipie<ISource>): Promise<void> {
        // TODO: Implement this method return this._targetBreakpoints.removeBreakpoint(bpRecipie);
    }

    private async considerColumnAndSelectBestBPLocation(location: LocationInScript): Promise<LocationInScript> {
        if (await this.doesTargetSupportColumnBreakpointsCached) {
            const thisLineStart = new Coordinates(location.coordinates.lineNumber, createColumnNumber(0));
            const nextLineStart = new Coordinates(createLineNumber(location.coordinates.lineNumber + 1), createColumnNumber(0));
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
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: BPRecipieAtLoadedSourceLogicDependencies,
        @inject(TYPES.IBreakpointFeaturesSupport) private readonly _breakpointFeaturesSupport: IBreakpointFeaturesSupport,
        private readonly _breakpointRegistry: BreakpointsRegistry,
        @inject(TYPES.ITargetBreakpoints) private readonly _targetBreakpoints: IDebuggeeBreakpoints,
        @inject(TYPES.IEventsToClientReporter) private readonly _eventsToClientReporter: IEventsToClientReporter) {
        this.doesTargetSupportColumnBreakpointsCached = this._breakpointFeaturesSupport.supportsColumnBreakpoints;
    }
}