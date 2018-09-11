import { BPRecipieInUnbindedSource, BPRecipie } from './bpRecipie';
import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { canonicalizeEverythingButSource, CurrentBPRecipiesInSource } from './clientBPRecipiesRegistry';
import { IRequestedSourceIdentifier } from '../sourceIdentifier';
import { ILoadedSource } from '../loadedSource';

export class RequestedBPRecipiesFromExistingBPsCalculator {
    constructor(
        public readonly resourceSourceIdentifier: IRequestedSourceIdentifier,
        private readonly _requestedBPRecipies: BPRecipiesInUnbindedSource,
        private readonly _currentBPRecipies: CurrentBPRecipiesInSource) { }

    public calculateDelta(): BPRecipiesDeltaInRequestedSource {
        const match = {
            matchesForDesired: [] as BPRecipieInUnbindedSource[], // Every iteration we'll add either the existing BP match, or the new BP as it's own match here
            desiredToAdd: [] as BPRecipieInUnbindedSource[], // Every time we don't find an existing match BP, we'll add the desired BP here
            existingToLeaveAsIs: [] as BPRecipieInUnbindedSource[], // Every time we do find an existing match BP, we'll add the existing BP here
            existingToRemove: [] as BPRecipieInUnbindedSource[] // Calculated at the end of the algorithm by doing (existingBreakpoints - existingToLeaveAsIs)
        };

        this._requestedBPRecipies.breakpoints.forEach(requestedBP => {
            const matchingBreakpoint = this._currentBPRecipies.findMatchingBreakpoint(requestedBP,
                existingMatch => {
                    match.existingToLeaveAsIs.push(existingMatch);
                    return existingMatch;
                }, () => {
                    match.desiredToAdd.push(requestedBP);
                    return requestedBP;
                });
            match.matchesForDesired.push(matchingBreakpoint);
        });

        const setOfExistingToLeaveAsIs = new Set(match.existingToLeaveAsIs);

        match.existingToRemove = this._currentBPRecipies.allBreakpoints().filter(bp => !setOfExistingToLeaveAsIs.has(bp));

        // Do some minor validations of the result just in case
        const delta = new BPRecipiesDeltaInRequestedSource(this.resourceSourceIdentifier, match.matchesForDesired, match.desiredToAdd, match.existingToRemove, match.existingToLeaveAsIs);
        this.validateResult(delta);
        return delta;
    }

    private validateResult(match: BPRecipiesDeltaInRequestedSource): void {
        let errorMessage = '';
        if (match.existingMatchesForRequested.length !== this._requestedBPRecipies.breakpoints.length) {
            errorMessage += 'Expected the matches for desired breakpoints list to have the same length as the desired breakpoints list\n';
        }

        if (match.requestedToAdd.length + match.existingToLeaveAsIs.length !== this._requestedBPRecipies.breakpoints.length) {
            errorMessage += 'Expected the desired breakpoints to add plus the existing breakpoints to leave as-is to have the same quantity as the total desired breakpoints\n';
        }

        if (match.existingToLeaveAsIs.length + match.existingToRemove.length !== this._currentBPRecipies.allBreakpointsSize) {
            errorMessage += 'Expected the existing breakpoints to leave as-is plus the existing breakpoints to remove to have the same quantity as the total existing breakpoints\n';
        }

        if (errorMessage !== '') {
            const matchJson = {};
            Object.keys(match).forEach(key => {
                (matchJson as any)[key] = (match as any)[key].map(canonicalizeEverythingButSource);
            });

            const additionalDetails = `\nDesired breakpoints = ${JSON.stringify(this._requestedBPRecipies.breakpoints.map(canonicalizeEverythingButSource))}`
                + `\Existing breakpoints = ${JSON.stringify(this._currentBPRecipies.allBreakpoints().map(canonicalizeEverythingButSource))}`
                + `\nMatch = ${JSON.stringify(matchJson)}`;
            throw new Error(errorMessage + `\nmatch: ${additionalDetails}`);
        }
    }

    public toString(): string {
        return `Matching existing BPs logic:\nRequested BPs: ${this._requestedBPRecipies}\nExisting BPs: ${this._currentBPRecipies}`;
    }
}

export abstract class BPRecipiesDeltaCommonLogic<TResource extends ILoadedSource | IRequestedSourceIdentifier> {
    constructor(public readonly resource: TResource,
        public readonly existingMatchesForRequested: BPRecipie<TResource>[],
        public readonly requestedToAdd: BPRecipie<TResource>[],
        public readonly existingToRemove: BPRecipie<TResource>[],
        public readonly existingToLeaveAsIs: BPRecipie<TResource>[]) { }
}

export class BPRecipiesDeltaInRequestedSource extends BPRecipiesDeltaCommonLogic<IRequestedSourceIdentifier> {
    public tryGettingBPsInLoadedSource<R>(
        ifSuccesfulDo: (bpsInLoadedSourceDelta: BPRecipiesDeltaInLoadedSource) => R,
        ifFailedDo: (bpsInLoadedSourceDelta: BPRecipiesDeltaInRequestedSource) => R): R {
        return this.resource.tryGettingLoadedSource(loadedSource => {
            return ifSuccesfulDo(new BPRecipiesDeltaInLoadedSource(loadedSource,
                this.toLoadedSources(this.existingMatchesForRequested),
                this.toLoadedSources(this.requestedToAdd),
                this.toLoadedSources(this.existingToRemove),
                this.toLoadedSources(this.existingToLeaveAsIs)));
        }, () => ifFailedDo(this));
    }

    private toLoadedSources(bpRecipies: BPRecipie<IRequestedSourceIdentifier>[]): BPRecipie<ILoadedSource>[] {
        return bpRecipies.map(bpRecipie => bpRecipie.asBreakpointInLoadedSource());
    }
}

export class BPRecipiesDeltaInLoadedSource extends BPRecipiesDeltaCommonLogic<ILoadedSource> { }
