import { BPRecipieInLoadedSource } from './breakpointRecipie';
import { SetUsingProjection } from '../../collections/setUsingProjection';
import { DesiredBPsWithExistingBPsMatcher, DesiredBPsWithExistingBPsMatch } from './matchingLogic';
import { ILoadedSource } from '../loadedSource';
import { ValidatedMap } from '../../collections/validatedMap';
import { BreakpointRecipiesInLoadedSource } from './breakpointRecipies';
import { IBehaviorRecipie } from './behaviorRecipie';

export class ClientBPsRegistry {
    private readonly _loadedSourceToBreakpoints = new ValidatedMap<ILoadedSource, ClientBPsInLoadedSourceRegistry>();

    public matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource: BreakpointRecipiesInLoadedSource): DesiredBPsWithExistingBPsMatch {
        const registry = this._loadedSourceToBreakpoints.getOrAdd(desiredBPsInLoadedSource.source, () => new ClientBPsInLoadedSourceRegistry());
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
        breakpoint: BPRecipieInLoadedSource,
        ifFoundDo: (existingEquivalentBreakpoint: BPRecipieInLoadedSource) => R,
        ifNotFoundDo: () => R): R {
        const matchingBreakpoint = this._breakpoints.tryGetting(breakpoint);
        if (matchingBreakpoint !== undefined) {
            return ifFoundDo(matchingBreakpoint);
        } else {
            return ifNotFoundDo();
        }
    }

    public allBreakpoints(): BPRecipieInLoadedSource[] {
        // We return a copy to avoid side-effects
        return Array.from(this._breakpoints);
    }

    public get allBreakpointsSize(): number {
        return this._breakpoints.size;
    }
}

export class ClientBreakpointsInUnbindedSourceRegistry {

}

function canonicalizeBehavior(behavior: IBehaviorRecipie): string {
    return behavior.execute({
        alwaysBreak: () => 'none',
        conditionalBreak: conditionalBreak => `condition: ${conditionalBreak.expressionOfWhenToBreak}`,
        logMessage: logMessage => `log: ${logMessage.expressionOfMessageToLog}`,
        breakOnSpecificHitCounts: breakOnSpecificHitCounts => `breakWhenHitCount: ${breakOnSpecificHitCounts.expressionOfOnWhichHitsToBreak}`
    });
}

export function canonicalizeEverythingButSource(breakpoint: BPRecipieInLoadedSource): string {
    return JSON.stringify({
        lineNumber: breakpoint.locationInResource.lineNumber,
        columnNumber: breakpoint.locationInResource.columnNumber,
        behavior: canonicalizeBehavior(breakpoint.behavior)
    });
}
