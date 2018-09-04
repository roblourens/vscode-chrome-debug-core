import { BPRecipiesInUnbindedSource } from './bpRecipies';

import { BPRsDeltaCalculator, BPRsDeltaInRequestedSource } from './bpsDeltaCalculator';
import { BPRecipieInUnbindedSource } from './bpRecipie';
import { newResourceIdentifierMap, IResourceIdentifier } from '../sources/resourceIdentifier';

export class ClientCurrentBPRecipiesRegistry {
    private readonly _requestedSourcePathToCurrentBPRecipies = newResourceIdentifierMap<BPRecipieInUnbindedSource[]>();

    public updateBPRecipiesAndCalculateDelta(requestedBPRecipies: BPRecipiesInUnbindedSource): BPRsDeltaInRequestedSource {
        const bpsDelta = this.calculateBPSDeltaFromExistingBPs(requestedBPRecipies);
        this.registerCurrentBPRecipies(requestedBPRecipies.resource.identifier, bpsDelta.matchesForRequested);
        return bpsDelta;
    }

    private registerCurrentBPRecipies(requestedSourceIdentifier: IResourceIdentifier, bpRecipies: BPRecipieInUnbindedSource[]): void {
        this._requestedSourcePathToCurrentBPRecipies.set(requestedSourceIdentifier, Array.from(bpRecipies));
    }

    private calculateBPSDeltaFromExistingBPs(requestedBPRecipies: BPRecipiesInUnbindedSource): BPRsDeltaInRequestedSource {
        const bpRecipiesInSource = this._requestedSourcePathToCurrentBPRecipies.getOrAdd(requestedBPRecipies.requestedSourcePath, () => []);
        return new BPRsDeltaCalculator(requestedBPRecipies.resource, requestedBPRecipies, bpRecipiesInSource).calculate();
    }

    public toString(): string {
        return `Client BP Recipies Registry {${this._requestedSourcePathToCurrentBPRecipies}}`;
    }
}
