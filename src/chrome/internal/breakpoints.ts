import { DebugProtocol } from 'vscode-debugprotocol';
import { ISourceIdentifier } from './sourceIdentifier';
import { ScriptOrSourceOrIdentifier, LocationInResource } from './locationInResource';
import { ILoadedSource } from './loadedSource';
import { IScript } from './script';

export interface INewSetBreakpointsArgs {
    source: ISourceIdentifier;
    breakpoints: DebugProtocol.SourceBreakpoint[];
    lines?: number[];
    sourceModified?: boolean;
    authoredPath?: string;
}

export interface ISetBreakpointsArgs extends DebugProtocol.SetBreakpointsArguments {
    authoredPath?: string;
}

// TODO DIEGO: Finish implementing this file

export interface IBreakpointRecipie<TResource extends ScriptOrSourceOrIdentifier> {
    readonly locationInResource: LocationInResource<TResource>;
    readonly condition?: string;
    readonly hitCondition?: string;
    readonly logMessage?: string;
}

export class BehaviorRecipie {
    constructor(public readonly condition?: string,
        public readonly hitCondition?: string,
        public readonly logMessage?: string) { }
}

abstract class BreakpointRecipieCommonLogic<TResource extends ScriptOrSourceOrIdentifier> {
    public get condition(): string | undefined {
        return this.behavior.condition;
    }

    public get hitCondition(): string | undefined {
        return this.behavior.hitCondition;
    }

    public get logMessage(): string | undefined {
        return this.behavior.logMessage;
    }
    constructor(
        public readonly locationInResource: LocationInResource<TResource>,
        public readonly behavior: BehaviorRecipie) { }
}

export class BreakpointRecipieInLoadedSource extends BreakpointRecipieCommonLogic<ILoadedSource> implements IBreakpointRecipie<ILoadedSource> {

}

export class BreakpointRecipieInUnbindedSource extends BreakpointRecipieCommonLogic<ISourceIdentifier> implements IBreakpointRecipie<ISourceIdentifier> {
    public tryGettingBreakpointInLoadedSource<R>(
        whenSuccesfulDo: (breakpointInLoadedSource: BreakpointRecipieInLoadedSource) => R,
        whenFailedDo: (breakpointInUnbindedSource: BreakpointRecipieInUnbindedSource) => R): R {
        return this.locationInResource.tryGettingLocationInLoadedSource(
            locationInLoadedSource => whenSuccesfulDo(new BreakpointRecipieInLoadedSource(locationInLoadedSource, this.behavior)),
            () => whenFailedDo(this));
    }

    public asBreakpointInLoadedSource(): BreakpointRecipieInLoadedSource {
        return this.tryGettingBreakpointInLoadedSource(
            breakpointInLoadedSource => breakpointInLoadedSource,
            () => { throw new Error(`Failed to convert ${this} into a breakpoint in a loaded source`); });
    }
}

export type IBreakpointRecipieInLoadedSource = IBreakpointRecipie<ILoadedSource>;
export type IBreakpointRecipieInUnbindedSource = IBreakpointRecipie<ISourceIdentifier>;

type BreakpointRecipie<TResource extends ScriptOrSourceOrIdentifier> =
    TResource extends ISourceIdentifier ? BreakpointRecipieInUnbindedSource :
    TResource extends ILoadedSource ? BreakpointRecipieInLoadedSource :
    TResource extends IScript ? IBreakpointRecipie<IScript> :
    never;

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
