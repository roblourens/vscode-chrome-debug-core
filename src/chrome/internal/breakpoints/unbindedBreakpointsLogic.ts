import { ValidatedMap } from '../../collections/validatedMap';
import { IResourceIdentifier } from '../resourceIdentifier';
import { BreakpointRecipiesInUnbindedSource } from './breakpointRecipies';

export class UnbindedBreakpointsLogic {
    private readonly _sourceIdentifierToBPRecipies = new ValidatedMap<IResourceIdentifier, BreakpointRecipiesInUnbindedSource>();

    public setBreakpoints(desiredBPs: BreakpointRecipiesInUnbindedSource): any {
        this._sourceIdentifierToBPRecipies.set(desiredBPs.identifier.identifier, desiredBPs);
    }
}