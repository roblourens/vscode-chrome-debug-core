import { BPRecipiesInUnbindedSource } from './bpRecipies';

import { RequestedBPRecipiesFromExistingBPsCalculator, BPRecipiesDeltaInRequestedSource } from './matchingLogic';
import { SetUsingProjection } from '../../collections/setUsingProjection';
import { BPRecipieInUnbindedSource } from './bpRecipie';
import { IBPBehavior } from './bpBehavior';
import { newResourceIdentifierMap, IResourceIdentifier } from '../resourceIdentifier';

export class ClientBPRecipiesRegistry {
    private readonly _requestedSourceIdentifierToCurrentBPRecipies = newResourceIdentifierMap<CurrentBPRecipiesInSource>();

    public updateBPRecipiesAndCalculateDelta(requestedBPRecipies: BPRecipiesInUnbindedSource): BPRecipiesDeltaInRequestedSource {
        const bpsDelta = this.calculateBPSDeltaFromExistingBPs(requestedBPRecipies);
        this.registerCurrentBPRecipies(requestedBPRecipies.resource.identifier, bpsDelta.matchesForRequested);
        return bpsDelta;
    }

    private registerCurrentBPRecipies(requestedSourceIdentifier: IResourceIdentifier, bpRecipies: BPRecipieInUnbindedSource[]): void {
        this._requestedSourceIdentifierToCurrentBPRecipies.set(requestedSourceIdentifier, new CurrentBPRecipiesInSource(bpRecipies));
    }

    private calculateBPSDeltaFromExistingBPs(requestedBPRecipies: BPRecipiesInUnbindedSource): BPRecipiesDeltaInRequestedSource {
        const registry = this._requestedSourceIdentifierToCurrentBPRecipies.getOrAdd(requestedBPRecipies.requestedSourceIdentifier, () => new CurrentBPRecipiesInSource([]));
        return registry.calculateBPSDeltaFromExistingBPs(requestedBPRecipies);
    }

    public toString(): string {
        return `Client BP Recipies Registry:\n${this._requestedSourceIdentifierToCurrentBPRecipies}`;
    }
}

export class CurrentBPRecipiesInSource {
    private readonly _bpRecipies = new SetUsingProjection(canonicalizeEverythingButSource);

    /**
     * Precondition: All the breakpoints are in the same loaded source
     */
    public calculateBPSDeltaFromExistingBPs(requestedBPRecipies: BPRecipiesInUnbindedSource): BPRecipiesDeltaInRequestedSource {
        return new RequestedBPRecipiesFromExistingBPsCalculator(requestedBPRecipies.resource, requestedBPRecipies, this).calculateDelta();
    }

    public findMatchingBreakpoint<R>(
        breakpoint: BPRecipieInUnbindedSource,
        ifFoundDo: (existingEquivalentBreakpoint: BPRecipieInUnbindedSource) => R,
        ifNotFoundDo: () => R): R {
        const matchingBreakpoint = this._bpRecipies.tryGetting(breakpoint);
        if (matchingBreakpoint !== undefined) {
            return ifFoundDo(matchingBreakpoint);
        } else {
            return ifNotFoundDo();
        }
    }

    public allBreakpoints(): BPRecipieInUnbindedSource[] {
        // We return a copy to avoid side-effects
        return Array.from(this._bpRecipies);
    }

    public get allBreakpointsSize(): number {
        return this._bpRecipies.size;
    }

    public toString(): string {
        return `Existing BP Recipies In Loaded Source Registry:\n${this._bpRecipies}`;
    }

    constructor(bpRecipies: BPRecipieInUnbindedSource[]) {
        this._bpRecipies = new SetUsingProjection(canonicalizeEverythingButSource, bpRecipies);
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

export function canonicalizeEverythingButSource(breakpoint: BPRecipieInUnbindedSource): string {
    // TODO DIEGO: Should we ignore the behavior, to make BP colissions and updates work?
    return JSON.stringify({
        lineNumber: breakpoint.locationInResource.lineNumber,
        columnNumber: breakpoint.locationInResource.columnNumber,
        behavior: canonicalizeBehavior(breakpoint.behavior)
    });
}
