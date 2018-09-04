import { ValidatedMap } from '../../collections/validatedMap';

import { ILoadedSource } from '../loadedSource';

import { BPRecipiesInLoadedSource } from './bpRecipies';

import { DesiredBPsWithExistingBPsMatch, DesiredBPsWithExistingBPsMatcher } from './matchingLogic';
import { SetUsingProjection } from '../../collections/setUsingProjection';
import { BPRecipieInLoadedSource } from './bpRecipie';
import { IBPBehavior } from './bpBehavior';

export class ClientBPRecipiesRegistry {
    private readonly _loadedSourceToBreakpoints = new ValidatedMap<ILoadedSource, ExistingBPRecipiesInLoadedSource>();

    public matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource: BPRecipiesInLoadedSource): DesiredBPsWithExistingBPsMatch {
        const registry = this._loadedSourceToBreakpoints.getOrAdd(desiredBPsInLoadedSource.source, () => new ExistingBPRecipiesInLoadedSource());
        return registry.matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource);
    }

    public toString(): string {
        return `Client BP Recipies Registry:\n${this._loadedSourceToBreakpoints}`;
    }
}

export class ExistingBPRecipiesInLoadedSource {
    private readonly _bpRecipies = new SetUsingProjection(canonicalizeEverythingButSource);

    /**
     * Precondition: All the breakpoints are in the same loaded source
     */
    public matchDesiredBPsWithExistingBPs(desiredBPs: BPRecipiesInLoadedSource): DesiredBPsWithExistingBPsMatch {
        return new DesiredBPsWithExistingBPsMatcher(desiredBPs, this).match();
    }

    public findMatchingBreakpoint<R>(
        breakpoint: BPRecipieInLoadedSource,
        ifFoundDo: (existingEquivalentBreakpoint: BPRecipieInLoadedSource) => R,
        ifNotFoundDo: () => R): R {
        const matchingBreakpoint = this._bpRecipies.tryGetting(breakpoint);
        if (matchingBreakpoint !== undefined) {
            return ifFoundDo(matchingBreakpoint);
        } else {
            return ifNotFoundDo();
        }
    }

    public allBreakpoints(): BPRecipieInLoadedSource[] {
        // We return a copy to avoid side-effects
        return Array.from(this._bpRecipies);
    }

    public get allBreakpointsSize(): number {
        return this._bpRecipies.size;
    }

    public toString(): string {
        return `Existing BP Recipies In Loaded Source Registry:\n${this._bpRecipies}`;
    }
}

function canonicalizeBehavior(behavior: IBPBehavior): string {
    return behavior.execute({
        alwaysBreak: () => 'none',
        conditionalBreak: conditionalBreak => `condition: ${conditionalBreak.expressionOfWhenToBreak}`,
        logMessage: logMessage => `log: ${logMessage.expressionOfMessageToLog}`,
        breakOnSpecificHitCounts: breakOnSpecificHitCounts => `breakWhenHitCount: ${breakOnSpecificHitCounts.expressionOfOnWhichHitsToBreak}`
    });
}

export function canonicalizeEverythingButSource(breakpoint: BPRecipieInLoadedSource): string {
    // TODO DIEGO: Should we ignore the behavior, to make BP colissions and updates work?
    return JSON.stringify({
        lineNumber: breakpoint.locationInResource.lineNumber,
        columnNumber: breakpoint.locationInResource.columnNumber,
        behavior: canonicalizeBehavior(breakpoint.behavior)
    });
}
