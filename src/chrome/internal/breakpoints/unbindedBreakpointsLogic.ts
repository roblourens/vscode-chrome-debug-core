import { newResourceIdentifierMap } from '../resourceIdentifier';
import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { ScriptParsedEvent } from '../../target/events';
import { Communicator } from '../../communication/communicator';
import { Target } from '../../communication/targetChannels';
import { ILoadedSource } from '../loadedSource';
import { Internal } from '../../communication/internalChannels';
import { BPRecipieInUnbindedSource } from './bpRecipie';
import { asyncMap } from '../../collections/async';
import { Client } from '../../communication/clientChannels';
import { BPRecipieIsUnbinded, BPRecipieIsBinded } from './bpRecipieStatus';

export class UnbindedBreakpointsLogic {
    private readonly _sourceIdentifierToBPRecipies = newResourceIdentifierMap<Set<BPRecipieInUnbindedSource>>();

    private readonly addBreakpoint = this._communicator.getRequester(Internal.Breakpoints.AddBreakpoint);
    private readonly sendBPStatusChanged = this._communicator.getRequester(Client.EventSender.SendBPStatusChanged);

    public setBreakpoints(requestedBPs: BPRecipiesInUnbindedSource): void {
        const bpRecipiesForSource = this._sourceIdentifierToBPRecipies.getOrAdd(requestedBPs.requestedSourceIdentifier, () => new Set<BPRecipieInUnbindedSource>());
        requestedBPs.breakpoints.map(e => bpRecipiesForSource.add(e));
    }

    public onScriptParsed(scriptParsed: ScriptParsedEvent): void {
        scriptParsed.script.allSources.forEach(source => this.bindUnbindedBreakpoints(source));
    }

    public async bindUnbindedBreakpoints(source: ILoadedSource): Promise<void> {
        const unbindBPRecipies = this._sourceIdentifierToBPRecipies.tryGetting(source.identifier);
        if (unbindBPRecipies !== undefined) {
            this._sourceIdentifierToBPRecipies.delete(source.identifier); // We remove it first in sync to avoid race conditions
            const bpRecipiesToIterate = Array.from(unbindBPRecipies); // We'll delete elements while iterating. To avoid issues we iterate a copy
            await asyncMap(bpRecipiesToIterate, async bpRecipie => {
                try {
                    const bpStatus = await this.addBreakpoint(bpRecipie.asBreakpointWithLoadedSource(source));
                    this.sendBPStatusChanged({
                        bpRecipieStatus: new BPRecipieIsBinded(bpRecipie, bpStatus, 'TODO DIEGO'),
                        reason: 'changed'
                    });
                    unbindBPRecipies.delete(bpRecipie);
                } catch (exception) {
                    this.sendBPStatusChanged({
                        bpRecipieStatus: new BPRecipieIsUnbinded(bpRecipie, `An unexpected error happen while trying to set the breakpoint: ${exception})`),
                        reason: 'changed'
                    });
                }
            });

            if (unbindBPRecipies.size > 0) {
                // If we still have BPs recipies that we couldn't add, we put them back in
                this._sourceIdentifierToBPRecipies.set(source.identifier, unbindBPRecipies);
            }
        }
    }

    public toString(): string {
        return `Unbinded BPs logic:\nRequested source identifier to BP recipies: ${this._sourceIdentifierToBPRecipies}`;
    }

    constructor(private readonly _communicator: Communicator) {
        this._communicator.subscribe(Target.Debugger.OnScriptParsed, scriptParsed => this.onScriptParsed(scriptParsed));
    }
}