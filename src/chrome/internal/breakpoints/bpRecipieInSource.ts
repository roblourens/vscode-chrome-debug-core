import { ISource } from '../sources/source';
import { Location } from '../locations/location';
import { ILoadedSource } from '../sources/loadedSource';
import { IBPActionWhenHit, AlwaysPause } from './bpActionWhenHit';
import { BPRecipieInLoadedSource } from './baseMappedBPRecipie';
import { BaseBPRecipie, IBPRecipie } from './bpRecipie';

export class BPRecipieInSource<TBPActionWhenHit extends IBPActionWhenHit = IBPActionWhenHit> extends BaseBPRecipie<ISource, TBPActionWhenHit> {
    constructor(public readonly location: Location<ISource>, public readonly bpActionWhenHit: TBPActionWhenHit) {
        super();
    }

    public isEquivalentTo(right: IBPRecipie<ISource>): boolean {
        return this.location.isEquivalentTo(right.location) &&
            this.bpActionWhenHit.isEquivalentTo(right.bpActionWhenHit);
    }

    public get unmappedBPRecipie(): BPRecipieInSource<TBPActionWhenHit> {
        return this;
    }

    public withAlwaysBreakAction(): BPRecipieInSource<AlwaysPause> {
        return new BPRecipieInSource<AlwaysPause>(this.location, new AlwaysPause());
    }

    public tryResolvingSource<R>(succesfulAction: (breakpointInLoadedSource: BPRecipieInLoadedSource) => R, failedAction: (breakpointInUnbindedSource: BPRecipieInSource) => R): R {
        return this.location.tryResolvingSource(
            locationInLoadedSource => succesfulAction(new BPRecipieInLoadedSource(this, locationInLoadedSource)),
            () => failedAction(this));
    }

    public resolvedToLoadedSource(): BPRecipieInLoadedSource {
        return this.tryResolvingSource(
            breakpointInLoadedSource => breakpointInLoadedSource,
            () => { throw new Error(`Failed to convert ${this} into a breakpoint in a loaded source`); });
    }

    public resolvedWithLoadedSource(source: ILoadedSource<string>): BPRecipieInLoadedSource {
        return new BPRecipieInLoadedSource(this, this.location.resolvedWith(source));
    }
}
