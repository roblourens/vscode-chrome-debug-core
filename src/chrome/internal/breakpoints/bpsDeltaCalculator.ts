import { BPRecipieInUnbindedSource, BPRecipie } from './bpRecipie';
import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { IRequestedSourceIdentifier } from '../sources/sourceIdentifier';
import { ILoadedSource } from '../sources/loadedSource';
import { IBPBehavior } from './bpBehavior';
import { SetUsingProjection } from '../../collections/setUsingProjection';

export class ReplacementForExistingBPR {
    constructor(
        public readonly existingBP: BPRecipieInUnbindedSource,
        public readonly replacement: BPRecipieInUnbindedSource) { }
}

function canonicalizeBPLocation(breakpoint: BPRecipieInUnbindedSource): string {
    return JSON.stringify({
        lineNumber: breakpoint.locationInResource.lineNumber,
        columnNumber: breakpoint.locationInResource.columnNumber
    });
}

export class BPRsDeltaCalculator {
    private readonly _currentBPRecipies: SetUsingProjection<BPRecipieInUnbindedSource, string>;

    constructor(
        public readonly requestedSourceIdentifier: IRequestedSourceIdentifier,
        private readonly _requestedBPRecipies: BPRecipiesInUnbindedSource,
        currentBPRecipies: BPRecipieInUnbindedSource[]) {
        this._currentBPRecipies = new SetUsingProjection(canonicalizeBPLocation, currentBPRecipies);
    }

    public calculate(): BPRsDeltaInRequestedSource {
        const match = {
            replacementsForExistingOnes: [] as ReplacementForExistingBPR[], // TODO DIEGO
            matchesForRequested: [] as BPRecipieInUnbindedSource[], // Every iteration we'll add either the existing BP match, or the new BP as it's own match here
            requestedToAdd: [] as BPRecipieInUnbindedSource[], // Every time we don't find an existing match BP, we'll add the desired BP here
            existingToLeaveAsIs: [] as BPRecipieInUnbindedSource[], // Every time we do find an existing match BP, we'll add the existing BP here
            existingToRemove: [] as BPRecipieInUnbindedSource[] // Calculated at the end of the algorithm by doing (existingBreakpoints - existingToLeaveAsIs)
        };

        this._requestedBPRecipies.breakpoints.forEach(requestedBP => {
            const existingMatch = this._currentBPRecipies.tryGetting(requestedBP);

            let matchingBreakpoint;
            if (existingMatch !== undefined) {
                if (requestedBP.behavior.isEquivalent(existingMatch.behavior)) {
                    match.existingToLeaveAsIs.push(existingMatch);
                    matchingBreakpoint = existingMatch;
                } else {
                    match.replacementsForExistingOnes.push(new ReplacementForExistingBPR(existingMatch, requestedBP));
                    matchingBreakpoint = requestedBP;
                }
            } else {
                match.requestedToAdd.push(requestedBP);
                matchingBreakpoint = requestedBP;
            }
            match.matchesForRequested.push(matchingBreakpoint);
        });

        const setOfExistingToLeaveAsIs = new Set(match.existingToLeaveAsIs.concat(match.replacementsForExistingOnes.map(b => b.existingBP)));

        match.existingToRemove = Array.from(this._currentBPRecipies).filter(bp => !setOfExistingToLeaveAsIs.has(bp));

        // Do some minor validations of the result just in case
        const delta = new BPRsDeltaInRequestedSource(this.requestedSourceIdentifier, match.replacementsForExistingOnes, match.matchesForRequested,
            match.requestedToAdd, match.existingToRemove, match.existingToLeaveAsIs);
        this.validateResult(delta);
        return delta;
    }

    private validateResult(match: BPRsDeltaInRequestedSource): void {
        let errorMessage = '';
        if (match.matchesForRequested.length !== this._requestedBPRecipies.breakpoints.length) {
            errorMessage += 'Expected the matches for desired breakpoints list to have the same length as the desired breakpoints list\n';
        }

        if (match.requestedToAdd.length + match.existingToLeaveAsIs.length + match.existingToBeReplaced.length !== this._requestedBPRecipies.breakpoints.length) {
            errorMessage += 'Expected the desired breakpoints to add plus the existing breakpoints to leave as-is to have the same quantity as the total desired breakpoints\n';
        }

        if (match.existingToLeaveAsIs.length + match.existingToBeReplaced.length + match.existingToRemove.length !== this._currentBPRecipies.size) {
            errorMessage += 'Expected the existing breakpoints to leave as-is plus the existing breakpoints to remove to have the same quantity as the total existing breakpoints\n';
        }

        if (errorMessage !== '') {
            const matchJson = {
                matchesForRequested: this.printLocations(match.matchesForRequested),
                requestedToAdd: this.printLocations(match.requestedToAdd),
                existingToRemove: this.printLocations(match.existingToRemove),
                existingToLeaveAsIs: this.printLocations(match.existingToLeaveAsIs),
                existingToBeReplaced: this.printLocationsOfReplacements(match.existingToBeReplaced),
            };

            const additionalDetails = `\nDesired breakpoints = ${JSON.stringify(this._requestedBPRecipies.breakpoints.map(canonicalizeBPLocation))}`
                + `\Existing breakpoints = ${JSON.stringify(Array.from(this._currentBPRecipies).map(canonicalizeBPLocation))}`
                + `\nMatch = ${JSON.stringify(matchJson)}`;
            throw new Error(errorMessage + `\nmatch: ${additionalDetails}`);
        }
    }

    private printLocationsOfReplacements(existingToBeReplaced: ReplacementForExistingBPR[]): string[] {
        return existingToBeReplaced.map(rp =>
            `At ${rp.existingBP.locationInResource.location} change <${rp.existingBP.behavior}> to <${rp.replacement.behavior}>`);
    }

    private printLocations(bpRecipies: BPRecipieInUnbindedSource<IBPBehavior>[]): string[] {
        return bpRecipies.map(bpRecipie => `${bpRecipie.locationInResource.location}`);
    }

    public toString(): string {
        return `BPs Delta Calculator {\n\tRequested BPs: ${this._requestedBPRecipies}\n\tExisting BPs: ${this._currentBPRecipies}\n}`;
    }
}

export abstract class BPRsDeltaCommonLogic<TResource extends ILoadedSource | IRequestedSourceIdentifier> {
    constructor(public readonly resource: TResource,
        public readonly existingToBeReplaced: ReplacementForExistingBPR[],
        public readonly matchesForRequested: BPRecipie<TResource>[],
        public readonly requestedToAdd: BPRecipie<TResource>[],
        public readonly existingToRemove: BPRecipie<TResource>[],
        public readonly existingToLeaveAsIs: BPRecipie<TResource>[]) { }
}

export class BPRsDeltaInRequestedSource extends BPRsDeltaCommonLogic<IRequestedSourceIdentifier> { }

export class BPRsDeltaInLoadedSource extends BPRsDeltaCommonLogic<ILoadedSource> { }
