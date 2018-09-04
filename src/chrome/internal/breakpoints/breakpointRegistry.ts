import { Crdp } from '../../..';
import { BreakpointInScript } from './breakpoint';
import { ValidatedMap } from '../../collections/validatedMap';
import { ValidatedMultiMap } from '../../collections/validatedMultiMap';
import { BreakpointRecipie } from './breakpointRecipie';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';

export class BreakpointRegistry {
    // TODO DIEGO: Figure out how to handle if two breakpoint rules set a breakpoint in the same location so it ends up being the same breakpoint id
    private readonly _recipieToBreakpointId = new ValidatedMap<BreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>, Crdp.Debugger.BreakpointId>();
    private readonly _recipieToBreakpoints = new ValidatedMultiMap<BreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>, BreakpointInScript>();

    public registerRecipie(cdtpBreakpointId: Crdp.Debugger.BreakpointId, bpRecipie: BreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._recipieToBreakpointId.set(bpRecipie, cdtpBreakpointId);
    }

    public registerBreakpoint(cdtpBreakpointId: Crdp.Debugger.BreakpointId, bp: BreakpointInScript): void {
        this._recipieToBreakpoints.add(bp.recipie, bp);
        return this.registerRecipie(cdtpBreakpointId, bp.recipie);
    }

    public getBreakpointId(bpRecipie: BreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): Crdp.Debugger.BreakpointId {
        return this._recipieToBreakpointId.get(bpRecipie);
    }
}