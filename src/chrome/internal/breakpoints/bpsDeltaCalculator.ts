import { BPRecipieInSource, BPRecipie } from './bpRecipie';
import { BPRecipiesInUnresolvedSource } from './bpRecipies';
import { ISource } from '../sources/source';
import { ILoadedSource } from '../sources/loadedSource';
import { IBPActionWhenHit } from './bpActionWhenHit';
import { SetUsingProjection } from '../../collections/setUsingProjection';
import assert = require('assert');

function canonicalizeBPLocation(breakpoint: BPRecipieInSource): string {
    return `${breakpoint.location.position.lineNumber}:${breakpoint.location.position.columnNumber}[${breakpoint.bpActionWhenHit}]`;
}

export class BPRsDeltaCalculator {
    private readonly _currentBPRecipies: SetUsingProjection<BPRecipieInSource, string>;

    constructor(
        public readonly requestedSourceIdentifier: ISource,
        private readonly _requestedBPRecipies: BPRecipiesInUnresolvedSource,
        currentBPRecipies: BPRecipieInSource[]) {
        this._currentBPRecipies = new SetUsingProjection(canonicalizeBPLocation, currentBPRecipies);
    }

    public calculate(): BPRsDeltaInRequestedSource {
        const match = {
            matchesForRequested: [] as BPRecipieInSource[], // Every iteration we'll add either the existing BP match, or the new BP as it's own match here
            requestedToAdd: [] as BPRecipieInSource[], // Every time we don't find an existing match BP, we'll add the desired BP here
            existingToLeaveAsIs: [] as BPRecipieInSource[], // Every time we do find an existing match BP, we'll add the existing BP here
            existingToRemove: [] as BPRecipieInSource[] // Calculated at the end of the algorithm by doing (existingBreakpoints - existingToLeaveAsIs)
        };

        this._requestedBPRecipies.breakpoints.forEach(requestedBP => {
            const existingMatch = this._currentBPRecipies.tryGetting(requestedBP);

            let matchingBreakpoint;
            if (existingMatch !== undefined) {
                assert(requestedBP.isEquivalentTo(existingMatch), `The existing match ${existingMatch} is expected to be equivalent to the requested BP ${requestedBP}`);
                match.existingToLeaveAsIs.push(existingMatch);
                matchingBreakpoint = existingMatch;
            } else {
                match.requestedToAdd.push(requestedBP);
                matchingBreakpoint = requestedBP;
            }
            match.matchesForRequested.push(matchingBreakpoint);
        });

        const setOfExistingToLeaveAsIs = new Set(match.existingToLeaveAsIs);

        match.existingToRemove = Array.from(this._currentBPRecipies).filter(bp => !setOfExistingToLeaveAsIs.has(bp));

        // Do some minor validations of the result just in case
        const delta = new BPRsDeltaInRequestedSource(this.requestedSourceIdentifier, match.matchesForRequested,
            match.requestedToAdd, match.existingToRemove, match.existingToLeaveAsIs);
        this.validateResult(delta);
        return delta;
    }

    private validateResult(match: BPRsDeltaInRequestedSource): void {
        let errorMessage = '';
        if (match.matchesForRequested.length !== this._requestedBPRecipies.breakpoints.length) {
            errorMessage += 'Expected the matches for desired breakpoints list to have the same length as the desired breakpoints list\n';
        }

        if (match.requestedToAdd.length + match.existingToLeaveAsIs.length !== this._requestedBPRecipies.breakpoints.length) {
            errorMessage += 'Expected the desired breakpoints to add plus the existing breakpoints to leave as-is to have the same quantity as the total desired breakpoints\n';
        }

        if (match.existingToLeaveAsIs.length + match.existingToRemove.length !== this._currentBPRecipies.size) {
            errorMessage += 'Expected the existing breakpoints to leave as-is plus the existing breakpoints to remove to have the same quantity as the total existing breakpoints\n';
        }

        if (errorMessage !== '') {
            const matchJson = {
                matchesForRequested: this.printLocations(match.matchesForRequested),
                requestedToAdd: this.printLocations(match.requestedToAdd),
                existingToRemove: this.printLocations(match.existingToRemove),
                existingToLeaveAsIs: this.printLocations(match.existingToLeaveAsIs)
            };

            const additionalDetails = `\nDesired breakpoints = ${JSON.stringify(this._requestedBPRecipies.breakpoints.map(canonicalizeBPLocation))}`
                + `\Existing breakpoints = ${JSON.stringify(Array.from(this._currentBPRecipies).map(canonicalizeBPLocation))}`
                + `\nMatch = ${JSON.stringify(matchJson)}`;
            throw new Error(errorMessage + `\nmatch: ${additionalDetails}`);
        }
    }

    private printLocations(bpRecipies: BPRecipieInSource<IBPActionWhenHit>[]): string[] {
        return bpRecipies.map(bpRecipie => `${bpRecipie.location.position}`);
    }

    public toString(): string {
        return `BPs Delta Calculator {\n\tRequested BPs: ${this._requestedBPRecipies}\n\tExisting BPs: ${this._currentBPRecipies}\n}`;
    }
}

export abstract class BPRsDeltaCommonLogic<TResource extends ILoadedSource | ISource> {
    constructor(public readonly resource: TResource,
        public readonly matchesForRequested: BPRecipie<TResource>[],
        public readonly requestedToAdd: BPRecipie<TResource>[],
        public readonly existingToRemove: BPRecipie<TResource>[],
        public readonly existingToLeaveAsIs: BPRecipie<TResource>[]) { }
}

export class BPRsDeltaInRequestedSource extends BPRsDeltaCommonLogic<ISource> { }

export class BPRsDeltaInLoadedSource extends BPRsDeltaCommonLogic<ILoadedSource> { }
