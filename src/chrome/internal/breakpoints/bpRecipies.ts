import { ScriptOrSourceOrIdentifier } from '../locationInResource';
import { ILoadedSource } from '../loadedSource';
import { ISourceIdentifier } from '../sourceIdentifier';
import { BPRecipie } from './bpRecipie';
import { IResourceIdentifier } from '../resourceIdentifier';
import { printArray } from '../../collections/printting';

export class BPRecipiesCommonLogic<TResource extends ScriptOrSourceOrIdentifier> {
    constructor(public readonly resource: TResource, public readonly breakpoints: BPRecipie<TResource>[]) {
        this.breakpoints.forEach(breakpoint => {
            const bpResource = breakpoint.locationInResource.resource;
            if (bpResource !== this.resource) {
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

export class BPRecipiesInUnbindedSource extends BPRecipiesCommonLogic<ISourceIdentifier> {
    public tryGettingBPsInLoadedSource<R>(ifSuccesfulDo: (desiredBPsInLoadedSource: BPRecipiesInLoadedSource) => R, ifFaileDo: () => R): R {
        return this.resource.tryGettingLoadedSource(
            loadedSource => {
                const loadedSourceBPs = this.breakpoints.map(breakpoint => breakpoint.asBreakpointInLoadedSource());
                return ifSuccesfulDo(new BPRecipiesInLoadedSource(loadedSource, loadedSourceBPs));
            },
            ifFaileDo);
    }

    public get resourceIdentifier(): IResourceIdentifier {
        return this.resource.identifier;
    }
}
