import { ScriptOrSourceOrIdentifier } from '../locationInResource';
import { ILoadedSource } from '../loadedSource';
import { ISourceIdentifier } from '../sourceIdentifier';
import { BreakpointRecipie } from './breakpointRecipie';

export class BreakpointRecipiesCommonLogic<TResource extends ScriptOrSourceOrIdentifier> {
    constructor(public readonly resource: TResource, public readonly breakpoints: BreakpointRecipie<TResource>[]) {
        this.breakpoints.forEach(breakpoint => {
            const bpResource = breakpoint.locationInResource.resource;
            if (bpResource !== this.resource) {
                throw new Error(`Expected all the breakpoints to have source ${resource} yet the breakpoint ${breakpoint} had ${bpResource} as it's source`);
            }
        });
    }
}

export class BreakpointRecipiesInLoadedSource extends BreakpointRecipiesCommonLogic<ILoadedSource> {
    public get source(): ILoadedSource {
        return this.resource;
    }
}

export class BreakpointRecipiesInUnbindedSource extends BreakpointRecipiesCommonLogic<ISourceIdentifier> {
    public tryGettingBPsInLoadedSource<R>(ifSuccesfulDo: (desiredBPsInLoadedSource: BreakpointRecipiesInLoadedSource) => R, ifFaileDo: () => R): R {
        return this.resource.tryGettingLoadedSource(
            loadedSource => {
                const loadedSourceBPs = this.breakpoints.map(breakpoint => breakpoint.asBreakpointInLoadedSource());
                return ifSuccesfulDo(new BreakpointRecipiesInLoadedSource(loadedSource, loadedSourceBPs));
            },
            ifFaileDo);
    }

    public get identifier(): ISourceIdentifier {
        return this.resource;
    }
}
