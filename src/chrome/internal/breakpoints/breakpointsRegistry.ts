import { IBPRecipieStatus, BPRecipieIsBinded, BPRecipieIsUnbinded } from './bpRecipieStatus';
import { IBreakpoint } from './breakpoint';
import { ValidatedMultiMap } from '../../collections/validatedMultiMap';
import { BPRecipie, IBPRecipie } from './bpRecipie';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';

export class BPRecipieStatusRegistry {
    // TODO DIEGO: Figure out how to handle if two breakpoint rules set a breakpoint in the same location so it ends up being the same breakpoint id
    private readonly _unmappedRecipieToBreakpoints = new ValidatedMultiMap<IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>, IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>();

    public registerBPRecipie(bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._unmappedRecipieToBreakpoints.addKeyIfNotExistant(bpRecipie);
    }

    public registerBreakpointAsBinded(bp: IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._unmappedRecipieToBreakpoints.add(bp.recipie.unmappedBpRecipie, bp);
    }

    // return new BPRecipieIsBinded(bpRecipie, Array.from(this._bpRecipieToBreakpoints.get(bpRecipie)));

    public getStatusOfBPRecipieInLoadedSource(bpRecipie: IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): IBPRecipieStatus {
        const breakpoints = this._unmappedRecipieToBreakpoints.get(bpRecipie);
        if (breakpoints.size > 0) {
            return new BPRecipieIsBinded(bpRecipie, Array.from(breakpoints), 'TODO DIEGO');
        } else {
            return new BPRecipieIsUnbinded(bpRecipie, 'TODO DIEGO');
        }
    }

    public toString(): string {
        return `Breakpoints recipie status Registry:\nRecipie to breakpoints: ${this._unmappedRecipieToBreakpoints}`;
    }
}
