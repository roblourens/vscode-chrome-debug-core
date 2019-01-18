/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { injectable } from 'inversify';
import { ISource } from '../../sources/source';
import { IBPRecipie } from '../bpRecipie';
import { CDTPBPRecipie } from '../../../cdtpDebuggee/cdtpPrimitives';
import { BidirectionalMap } from '../../../collections/bidirectionalMap';

type ClientBPRecipie = IBPRecipie<ISource>;
type DebuggeeBPRecipie = CDTPBPRecipie;

@injectable()
export class CDTPBPRecipiesRegistry {
    private readonly _clientRecipieToDebuggeeRecipie = new BidirectionalMap<ClientBPRecipie, DebuggeeBPRecipie>();

    public register(clientBPRecipie: ClientBPRecipie, debuggeeBPRecipie: DebuggeeBPRecipie): void {
        this._clientRecipieToDebuggeeRecipie.set(clientBPRecipie, debuggeeBPRecipie);
    }

    public unregister(clientBPRecipie: ClientBPRecipie): void {
        this._clientRecipieToDebuggeeRecipie.deleteByLeft(clientBPRecipie);
    }

    public getDebuggeeBPRecipie(clientBPRecipie: ClientBPRecipie): DebuggeeBPRecipie {
        return this._clientRecipieToDebuggeeRecipie.getByLeft(clientBPRecipie);
    }

    public toString(): string {
        return `Client to Debuggee BP Recipies: ${this._clientRecipieToDebuggeeRecipie}`;
    }
}
