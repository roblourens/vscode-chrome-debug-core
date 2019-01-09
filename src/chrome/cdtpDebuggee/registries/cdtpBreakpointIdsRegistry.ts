import { BidirectionalMap } from '../../collections/bidirectionalMap';
import { Protocol as CDTP } from 'devtools-protocol';
import { injectable } from 'inversify';
import { CDTPBPRecipie } from '../cdtpPrimitives';

@injectable()
export class CDTPBreakpointIdsRegistry {
    // TODO DIEGO: Figure out how to handle if two breakpoint rules set a breakpoint in the same location so it ends up being the same breakpoint id
    private readonly _recipieToBreakpointId = new BidirectionalMap<CDTPBPRecipie, CDTP.Debugger.BreakpointId>();

    public registerRecipie(cdtpBreakpointId: CDTP.Debugger.BreakpointId, bpRecipie: CDTPBPRecipie): void {
        this._recipieToBreakpointId.set(bpRecipie, cdtpBreakpointId);
    }

    public unregisterRecipie(bpRecipie: CDTPBPRecipie): void {
        this._recipieToBreakpointId.deleteByLeft(bpRecipie);
    }

    public getBreakpointId(bpRecipie: CDTPBPRecipie): CDTP.Debugger.BreakpointId {
        return this._recipieToBreakpointId.getByLeft(bpRecipie);
    }

    public getRecipieByBreakpointId(cdtpBreakpointId: CDTP.Debugger.BreakpointId): CDTPBPRecipie {
        return this._recipieToBreakpointId.getByRight(cdtpBreakpointId);
    }

    public toString(): string {
        return `Breakpoint IDs: ${this._recipieToBreakpointId}`;
    }
}
