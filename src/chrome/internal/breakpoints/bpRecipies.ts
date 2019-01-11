import { ILoadedSource } from '../sources/loadedSource';
import { ISource } from '../sources/source';
import { BPRecipie } from './bpRecipie';
import { printArray } from '../../collections/printting';
import { IResourceIdentifier } from '../sources/resourceIdentifier';

export class BPRecipiesCommonLogic<TResource extends ILoadedSource | ISource> {
    constructor(public readonly resource: TResource, public readonly breakpoints: BPRecipie<TResource>[]) {
        this.breakpoints.forEach(breakpoint => {
            const bpResource = breakpoint.location.resource;
            if (!(bpResource as any).isEquivalent(this.resource)) {
                throw new Error(`Expected all the breakpoints to have source ${resource} yet the breakpoint ${breakpoint} had ${bpResource} as it's source`);
            }
        });
    }

    public toString(): string {
        return printArray(`Bps @ ${this.resource}`, this.breakpoints);
    }
}

export class BPRecipiesInLoadedSource extends BPRecipiesCommonLogic<ILoadedSource> {
    public get source(): ILoadedSource {
        return this.resource;
    }
}

export class BPRecipiesInUnresolvedSource extends BPRecipiesCommonLogic<ISource> {
    public tryGettingBPsInLoadedSource<R>(ifSuccesfulDo: (desiredBPsInLoadedSource: BPRecipiesInLoadedSource) => R, ifFaileDo: () => R): R {
        return this.resource.tryResolving(
            loadedSource => {
                const loadedSourceBPs = this.breakpoints.map(breakpoint => breakpoint.resolvedToLoadedSource());
                return ifSuccesfulDo(new BPRecipiesInLoadedSource(loadedSource, loadedSourceBPs));
            },
            ifFaileDo);
    }

    public get requestedSourcePath(): IResourceIdentifier {
        return this.resource.sourceIdentifier;
    }
}
