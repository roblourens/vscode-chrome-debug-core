import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { ILoadedSource } from '../sources/loadedSource';
import { asyncMap } from '../../collections/async';
import { BPRecipieIsUnbinded, BPRecipieIsBinded } from './bpRecipieStatus';
import { newResourceIdentifierMap, IResourceIdentifier } from '../sources/resourceIdentifier';
import { BPRecipieInLoadedSource } from './bpRecipie';
import { ConditionalBreak, AlwaysBreak } from './bpBehavior';
import { IBreakpoint } from './breakpoint';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locations/locationInResource';
import { BPStatusChangedParameters } from '../../client/eventSender';
import { PromiseDefer, promiseDefer } from '../../../utils';

export interface UnbindedBPLogicDependencies {
    addBreakpointForLoadedSource(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[]>;
    sendClientBPStatusChanged(statusChanges: BPStatusChangedParameters): Promise<void>;
    notifyAllBPsAreBinded(): void;
}

export class UnbindedBPLogic {
    private readonly _sourcePathToBPRecipies = newResourceIdentifierMap<BPRecipiesInUnbindedSource>();
    private readonly _sourcePathToBPsAreSetDefer = newResourceIdentifierMap<PromiseDefer<void>>();

    public replaceBPsForSourceWith(requestedBPs: BPRecipiesInUnbindedSource): void {
        this._sourcePathToBPRecipies.set(requestedBPs.requestedSourcePath, requestedBPs);
    }

    public waitUntilBPsAreSet(loadedSource: ILoadedSource): Promise<void> {
        const bpRecipies = this._sourcePathToBPRecipies.tryGetting(loadedSource.identifier);
        if (bpRecipies !== undefined) {
            return this.getBPsAreSetDefer(loadedSource.identifier).promise;
        } else {
            return Promise.resolve();
        }
    }

    private getBPsAreSetDefer(identifier: IResourceIdentifier): PromiseDefer<void> {
        return this._sourcePathToBPsAreSetDefer.getOrAdd(identifier, () => promiseDefer<void>());
    }

    public async onLoadedSourceIsAvailable(source: ILoadedSource): Promise<void> {
        const unbindBPRecipies = this._sourcePathToBPRecipies.tryGetting(source.identifier);

        if (unbindBPRecipies !== undefined) {
            // We remove it first in sync just to avoid race conditions (If we get multiple refreshes fast, we could get events for the same source path severla times)
            const defer = this.getBPsAreSetDefer(source.identifier);
            this._sourcePathToBPRecipies.delete(source.identifier);
            const remainingBPRecipies = new Set(unbindBPRecipies.breakpoints);
            await asyncMap(unbindBPRecipies.breakpoints, async bpRecipie => {
                try {
                    const bpStatus = await this._dependencies.addBreakpointForLoadedSource(bpRecipie.asBreakpointWithLoadedSource(source));
                    this._dependencies.sendClientBPStatusChanged({
                        bpRecipieStatus: new BPRecipieIsBinded(bpRecipie, bpStatus, 'TODO DIEGO'),
                        reason: 'changed'
                    });
                    remainingBPRecipies.delete(bpRecipie);
                } catch (exception) {
                    this._dependencies.sendClientBPStatusChanged({
                        bpRecipieStatus: new BPRecipieIsUnbinded(bpRecipie, `An unexpected error happen while trying to set the breakpoint: ${exception})`),
                        reason: 'changed'
                    });
                }
            });

            // Notify others that we are finished setting the BPs
            defer.resolve();
            this._sourcePathToBPsAreSetDefer.delete(source.identifier);

            if (remainingBPRecipies.size > 0) {
                // TODO DIEGO: Add telemetry given that we don't expect this to happen
                // If we still have BPs recipies that we couldn't add, we put them back in
                this._sourcePathToBPRecipies.set(source.identifier, new BPRecipiesInUnbindedSource(unbindBPRecipies.resource, Array.from(remainingBPRecipies)));
            }

            if (this._sourcePathToBPRecipies.size === 0) {
                this._dependencies.notifyAllBPsAreBinded();
            }
        }
    }

    public toString(): string {
        return `Unbinded BPs logic { Paths to BP recipies: ${this._sourcePathToBPRecipies}}`;
    }

    constructor(private readonly _dependencies: UnbindedBPLogicDependencies) {
    }
}