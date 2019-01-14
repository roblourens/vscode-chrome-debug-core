import { IBPRecipie } from './bpRecipie';
import { ITelemetryPropertyCollector, IComponent, ConnectedCDAConfiguration } from '../../..';
import { ScriptOrSourceOrURLOrURLRegexp } from '../locations/location';
import { BPRecipiesInUnresolvedSource, BPRecipiesInLoadedSource } from './bpRecipies';
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
import { IDebuggeeBreakpoints } from '../../cdtpDebuggee/features/cdtpDebuggeeBreakpoints';
import { BPRsDeltaInRequestedSource } from './bpsDeltaCalculator';
import { CDTPBreakpoint } from '../../cdtpDebuggee/cdtpPrimitives';
import { ISource } from '../sources/source';

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

    protected onBreakpointResolved(breakpoint: CDTPBreakpoint): void {
        this._breakpointRegistry.registerBreakpointAsBinded(breakpoint);
        this.onUnbounBPRecipieIsNowBound(breakpoint.recipie.unmappedBPRecipie);
    }

    private onUnbounBPRecipieIsNowBound(bpRecipie: IBPRecipie<ISource>): void {
        const bpRecipieStatus = this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie);
        this._eventsToClientReporter.sendBPStatusChanged({ reason: 'changed', bpRecipieStatus });
    }

    public async updateBreakpointsForFile(requestedBPs: BPRecipiesInUnresolvedSource, _?: ITelemetryPropertyCollector): Promise<IBPRecipieStatus[]> {
        const bpsDelta = this._clientBreakpointsRegistry.updateBPRecipiesAndCalculateDelta(requestedBPs);
        const requestedBPsToAdd = new BPRecipiesInUnresolvedSource(bpsDelta.resource, bpsDelta.requestedToAdd);
        bpsDelta.requestedToAdd.forEach(requestedBP => this._breakpointRegistry.registerBPRecipie(requestedBP));

        await requestedBPsToAdd.tryGettingBPsInLoadedSource(
            async requestedBPsToAddInLoadedSources => {
                // Match desired breakpoints to existing breakpoints
                if (requestedBPsToAddInLoadedSources.resource.doesScriptHasUrl()) {
                    await this.addNewBreakpointsForFile(requestedBPsToAddInLoadedSources);
                    await this.removeDeletedBreakpointsFromFile(bpsDelta);
                } else {
                    // TODO: We need to pause-update-resume the debugger here to avoid a race condition
                    await this.removeDeletedBreakpointsFromFile(bpsDelta);
                    await this.addNewBreakpointsForFile(requestedBPsToAddInLoadedSources);
                }
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

    private async removeDeletedBreakpointsFromFile(bpsDelta: BPRsDeltaInRequestedSource) {
        await asyncMap(bpsDelta.existingToRemove, async (existingBPToRemove) => {
            await this._bprInLoadedSourceLogic.removeBreakpoint(existingBPToRemove);
        });
    }

    private async addNewBreakpointsForFile(requestedBPsToAddInLoadedSources: BPRecipiesInLoadedSource) {
        await asyncMap(requestedBPsToAddInLoadedSources.breakpoints, async (requestedBP) => {
            // DIEGO TODO: Do we need to do one breakpoint at a time to avoid issues on CDTP, or can we do them in parallel now that we use a different algorithm?
            await this._bprInLoadedSourceLogic.addBreakpointAtLoadedSource(requestedBP);
        });
    }

    public install(): this {
        this._unbindedBreakpointsLogic.install();
        this._bpsWhileLoadingLogic.install();
        this._dependencies.onNoPendingBreakpoints(() => this._bpsWhileLoadingLogic.disableIfNeccesary());
        this._debuggeeBreakpoints.onBreakpointResolvedSyncOrAsync(breakpoint => this.onBreakpointResolved(breakpoint));
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
        @inject(TYPES.ITargetBreakpoints) private readonly _debuggeeBreakpoints: IDebuggeeBreakpoints,
        @inject(TYPES.ConnectedCDAConfiguration) private readonly _configuration: ConnectedCDAConfiguration) {
    }
}