import { BPRecipieInLoadedSource } from './bpRecipie';
import { BPRecipiesInLoadedSource } from './bpRecipies';
import { canonicalizeEverythingButSource, ExistingBPRecipiesInLoadedSource } from './clientBPRecipiesRegistry';

export class DesiredBPsWithExistingBPsMatcher {
    constructor(
        private readonly _desiredBreakpoints: BPRecipiesInLoadedSource,
        private readonly _existingBreakpoints: ExistingBPRecipiesInLoadedSource) { }

    public match(): DesiredBPsWithExistingBPsMatch {
        const match = {
            matchesForDesired: [] as BPRecipieInLoadedSource[], // Every iteration we'll add either the existing BP match, or the new BP as it's own match here
            desiredToAdd: [] as BPRecipieInLoadedSource[], // Every time we don't find an existing match BP, we'll add the desired BP here
            existingToLeaveAsIs: [] as BPRecipieInLoadedSource[], // Every time we do find an existing match BP, we'll add the existing BP here
            existingToRemove: [] as BPRecipieInLoadedSource[] // Calculated at the end of the algorithm by doing (existingBreakpoints - existingToLeaveAsIs)
        };

        this._desiredBreakpoints.breakpoints.forEach(desiredBreakpoint => {
            const matchingBreakpoint = this._existingBreakpoints.findMatchingBreakpoint(desiredBreakpoint,
                existingMatch => {
                    match.existingToLeaveAsIs.push(existingMatch);
                    return existingMatch;
                }, () => {
                    match.desiredToAdd.push(desiredBreakpoint);
                    return desiredBreakpoint;
                });
            match.matchesForDesired.push(matchingBreakpoint);
        });

        const setOfExistingToLeaveAsIs = new Set(match.existingToLeaveAsIs);

        match.existingToRemove = this._existingBreakpoints.allBreakpoints().filter(bp => !setOfExistingToLeaveAsIs.has(bp));

        // Do some minor validations of the result just in case
        this.validateResult(match);

        return match;
    }

    private validateResult(match: DesiredBPsWithExistingBPsMatch): void {
        let errorMessage = '';
        if (match.matchesForDesired.length !== this._desiredBreakpoints.breakpoints.length) {
            errorMessage += 'Expected the matches for desired breakpoints list to have the same length as the desired breakpoints list\n';
        }

        if (match.desiredToAdd.length + match.existingToLeaveAsIs.length !== this._desiredBreakpoints.breakpoints.length) {
            errorMessage += 'Expected the desired breakpoints to add plus the existing breakpoints to leave as-is to have the same quantity as the total desired breakpoints\n';
        }

        if (match.existingToLeaveAsIs.length + match.existingToRemove.length !== this._existingBreakpoints.allBreakpointsSize) {
            errorMessage += 'Expected the existing breakpoints to leave as-is plus the existing breakpoints to remove to have the same quantity as the total existing breakpoints\n';
        }

        if (errorMessage !== '') {
            const matchJson = {};
            Object.keys(match).forEach(key => {
                (matchJson as any)[key] = match[key as MatchKey].map(canonicalizeEverythingButSource);
            });

            const additionalDetails = `\nDesired breakpoints = ${JSON.stringify(this._desiredBreakpoints.breakpoints.map(canonicalizeEverythingButSource))}`
                + `\Existing breakpoints = ${JSON.stringify(this._existingBreakpoints.allBreakpoints().map(canonicalizeEverythingButSource))}`
                + `\nMatch = ${JSON.stringify(matchJson)}`;
            throw new Error(errorMessage + `\nmatch: ${additionalDetails}`);
        }
    }

    public toString(): string {
        return `Matching existing BPs logic:\nRequested BPs: ${this._desiredBreakpoints}\nExisting BPs: ${this._existingBreakpoints}`;
    }
}

type MatchKey = 'matchesForDesired' | 'desiredToAdd' | 'existingToRemove' | 'existingToLeaveAsIs';

export class DesiredBPsWithExistingBPsMatch {
    matchesForDesired: BPRecipieInLoadedSource[];
    desiredToAdd: BPRecipieInLoadedSource[];
    existingToRemove: BPRecipieInLoadedSource[];
    existingToLeaveAsIs: BPRecipieInLoadedSource[];
}
