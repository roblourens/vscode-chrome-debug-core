import { BreakpointRecipieInLoadedSource, BreakpointRecipiesInLoadedSource } from '../breakpoints';
import { SetUsingProjection } from '../../collections/setUsingProjection';
import { DesiredBPsWithExistingBPsMatcher, DesiredBPsWithExistingBPsMatch } from './matchingLogic';
import { ILoadedSource } from '../loadedSource';
import { ValidatedMap } from '../../collections/validatedMap';

export class ClientBPsRegistry {
    private readonly _loadedSourceToBreakpoints = new ValidatedMap<ILoadedSource, ClientBPsInLoadedSourceRegistry>();

    public matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource: BreakpointRecipiesInLoadedSource): DesiredBPsWithExistingBPsMatch {
        const registry = this._loadedSourceToBreakpoints.get(desiredBPsInLoadedSource.source);
        return registry.matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource);
    }
}

export class ClientBPsInLoadedSourceRegistry {
    private readonly _breakpoints = new SetUsingProjection(canonicalizeEverythingButSource);

    /**
     * Precondition: All the breakpoints are in the same loaded source
     */
    public matchDesiredBPsWithExistingBPs(desiredBPs: BreakpointRecipiesInLoadedSource): DesiredBPsWithExistingBPsMatch {
        return new DesiredBPsWithExistingBPsMatcher(desiredBPs, this).match();
    }

    public findMatchingBreakpoint<R>(
        breakpoint: BreakpointRecipieInLoadedSource,
        ifFoundDo: (existingEquivalentBreakpoint: BreakpointRecipieInLoadedSource) => R,
        ifNotFoundDo: () => R): R {
        const matchingBreakpoint = this._breakpoints.tryGetting(breakpoint);
        if (matchingBreakpoint !== null) {
            return ifFoundDo(matchingBreakpoint);
        } else {
            return ifNotFoundDo();
        }
    }

    public allBreakpoints(): BreakpointRecipieInLoadedSource[] {
        // We return a copy to avoid side-effects
        return Array.from(this._breakpoints);
    }

    public get allBreakpointsSize(): number {
        return this._breakpoints.size;
    }
}

export class ClientBreakpointsInUnbindedSourceRegistry {

}

export function canonicalizeEverythingButSource(breakpoint: BreakpointRecipieInLoadedSource): string {
    return JSON.stringify({
        lineNumber: breakpoint.locationInResource.lineNumber,
        columnNumber: breakpoint.locationInResource.columnNumber,
        condition: breakpoint.condition,
        hitCondition: breakpoint.hitCondition,
        logMessage: breakpoint.logMessage
    });
}
