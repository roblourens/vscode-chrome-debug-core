import { IBPRecipieStatus, BPRecipieIsBinded, BPRecipieIsUnbinded } from './bpRecipieStatus';
import { IBreakpoint } from './breakpoint';
import { ValidatedMultiMap } from '../../collections/validatedMultiMap';
import { BPRecipie } from './bpRecipie';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';

export class BPRecipieStatusRegistry {
    // TODO DIEGO: Figure out how to handle if two breakpoint rules set a breakpoint in the same location so it ends up being the same breakpoint id
    private readonly _recipieToBreakpoints = new ValidatedMultiMap<BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>, IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>();

    public registerBreakpointAsBinded(bp: IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._recipieToBreakpoints.add(bp.recipie, bp);
    }

    // return new BPRecipieIsBinded(bpRecipie, Array.from(this._bpRecipieToBreakpoints.get(bpRecipie)));

    public getStatusOfBPRecipieInLoadedSource(bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): IBPRecipieStatus {
        const breakpoints = this._recipieToBreakpoints.get(bpRecipie);
        if (breakpoints.size > 0) {
            return new BPRecipieIsBinded(bpRecipie, Array.from(breakpoints), 'TODO DIEGO');
        } else {
            return new BPRecipieIsUnbinded(bpRecipie, 'TODO DIEGO');
        }
    }

    public toString(): string {
        return `Breakpoints recipie status Registry:\nRecipie to breakpoints: ${this._recipieToBreakpoints}`;
    }
}
