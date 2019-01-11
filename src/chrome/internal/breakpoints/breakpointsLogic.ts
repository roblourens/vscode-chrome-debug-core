import { AnyBPRecipie } from './bpRecipie';
import { ITelemetryPropertyCollector, IComponent, ConnectedCDAConfiguration } from '../../..';
import { ScriptOrSourceOrURLOrURLRegexp } from '../locations/location';
import { BPRecipiesInUnresolvedSource } from './bpRecipies';
import { Breakpoint } from './breakpoint';
import { ReAddBPsWhenSourceIsLoaded, EventsConsumedByReAddBPsWhenSourceIsLoaded } from './features/reAddBPsWhenSourceIsLoaded';
import { asyncMap } from '../../collections/async';
import { IBPRecipieStatus } from './bpRecipieStatus';
import { ClientCurrentBPRecipiesRegistry } from './clientCurrentBPRecipiesRegistry';
import { BreakpointsRegistry } from './breakpointsRegistry';
import { BPRecipieAtLoadedSourceLogic } from './bpRecipieAtLoadedSourceLogic';
import { RemoveProperty } from '../../../typeUtils';
import { IEventsToClientReporter } from '../../client/eventSender';
import { PauseScriptLoadsToSetBPs, PauseScriptLoadsToSetBPsDependencies } from './features/pauseScriptLoadsToSetBPs';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';

export interface IOnPausedResult {
    didPause: boolean;
}

export interface InternalDependencies extends
    EventsConsumedByReAddBPsWhenSourceIsLoaded,
    PauseScriptLoadsToSetBPsDependencies {

    onAsyncBreakpointResolved(listener: (params: Breakpoint<ScriptOrSourceOrURLOrURLRegexp>) => void): void;
}

export type EventsConsumedByBreakpointsLogic = RemoveProperty<InternalDependencies,
    'waitUntilUnbindedBPsAreSet' |
    'notifyAllBPsAreBinded' |
    'tryGettingBreakpointAtLocation'> & { onNoPendingBreakpoints(listener: () => void): void };

@injectable()
export class BreakpointsLogic implements IComponent {
    private _isBpsWhileLoadingEnable: boolean;

    private readonly _clientBreakpointsRegistry = new ClientCurrentBPRecipiesRegistry();

    protected onAsyncBreakpointResolved(breakpoint: Breakpoint<ScriptOrSourceOrURLOrURLRegexp>): void {
        this._breakpointRegistry.registerBreakpointAsBinded(breakpoint);
        this.onUnbounBPRecipieIsNowBound(breakpoint.recipie);
    }

    private onUnbounBPRecipieIsNowBound(bpRecipie: AnyBPRecipie): void {
        const bpRecipieStatus = this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie);
        this._eventsToClientReporter.sendBPStatusChanged({ reason: 'changed', bpRecipieStatus });
    }

    public async updateBreakpointsForFile(requestedBPs: BPRecipiesInUnresolvedSource, _?: ITelemetryPropertyCollector): Promise<IBPRecipieStatus[]> {
        const bpsDelta = this._clientBreakpointsRegistry.updateBPRecipiesAndCalculateDelta(requestedBPs);
        const requestedBPsToAdd = new BPRecipiesInUnresolvedSource(bpsDelta.resource, bpsDelta.requestedToAdd);
        bpsDelta.requestedToAdd.forEach(requestedBP => this._breakpointRegistry.registerBPRecipie(requestedBP));
        bpsDelta.existingToBeReplaced.forEach(existingToBeReplaced => this._breakpointRegistry.registerBPRecipie(existingToBeReplaced.replacement));

        await requestedBPsToAdd.tryGettingBPsInLoadedSource(
            async requestedBPsToAddInLoadedSources => {
                // Match desired breakpoints to existing breakpoints

                await asyncMap(requestedBPsToAddInLoadedSources.breakpoints, async requestedBP => {
                    // DIEGO TODO: Do we need to do one breakpoint at a time to avoid issues on CDTP, or can we do them in parallel now that we use a different algorithm?
                    await this._bprInLoadedSourceLogic.addBreakpointAtLoadedSource(requestedBP);
                });
                await Promise.all(bpsDelta.existingToRemove.map(async existingBPToRemove => {
                    await this._bprInLoadedSourceLogic.removeBreakpoint(existingBPToRemove);
                }));

                await asyncMap(bpsDelta.existingToBeReplaced, async existingToBeReplaced => {
                    // TODO: There is a race condition between the remove and the add line. We cannot add first and remove second, because even though
                    // the breakpoints have a different condition, the target won't let you add two breakpoints to the same exact location.
                    // We need to investigate if we can make the new breakpoint using a pseudo-regexp to make the target think that they are on different locations
                    // and thus workaround this issue
                    await this._bprInLoadedSourceLogic.removeBreakpoint(existingToBeReplaced.existingBP);
                    await this._bprInLoadedSourceLogic.addBreakpointAtLoadedSource(existingToBeReplaced.replacement.resolvedToLoadedSource());
                });
            },
            () => {
                const existingUnbindedBPs = bpsDelta.existingToLeaveAsIs.filter(bp => !this._breakpointRegistry.getStatusOfBPRecipie(bp).isVerified());
                const requestedBPsPendingToAdd = new BPRecipiesInUnresolvedSource(bpsDelta.resource, bpsDelta.requestedToAdd.concat(existingUnbindedBPs));
                if (this._isBpsWhileLoadingEnable) {
                    this._bpsWhileLoadingLogic.enableIfNeccesary();
                }
                this._unbindedBreakpointsLogic.replaceBPsForSourceWith(requestedBPsPendingToAdd);
            });

        return bpsDelta.matchesForRequested.map(bpRecipie => this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie));
    }

    public install(): this {
        this._unbindedBreakpointsLogic.install();
        this._bpsWhileLoadingLogic.install();
        this._dependencies.onNoPendingBreakpoints(() => this._bpsWhileLoadingLogic.disableIfNeccesary());
        this._bprInLoadedSourceLogic.install();
        return this.configure();
    }

    public configure(): this {
        this._isBpsWhileLoadingEnable = this._configuration.args.breakOnLoadStrategy !== 'off';
        return this;
    }

    constructor(
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: EventsConsumedByBreakpointsLogic,
        @inject(TYPES.BreakpointsRegistry) private readonly _breakpointRegistry: BreakpointsRegistry,
        @inject(TYPES.ReAddBPsWhenSourceIsLoaded) private readonly _unbindedBreakpointsLogic: ReAddBPsWhenSourceIsLoaded,
        @inject(TYPES.PauseScriptLoadsToSetBPs) private readonly _bpsWhileLoadingLogic: PauseScriptLoadsToSetBPs,
        @inject(TYPES.BPRecipieInLoadedSourceLogic) private readonly _bprInLoadedSourceLogic: BPRecipieAtLoadedSourceLogic,
        @inject(TYPES.EventSender) private readonly _eventsToClientReporter: IEventsToClientReporter,
        @inject(TYPES.ConnectedCDAConfiguration) private readonly _configuration: ConnectedCDAConfiguration) {
        this._dependencies.onAsyncBreakpointResolved(breakpoint => this.onAsyncBreakpointResolved(breakpoint));
    }
}