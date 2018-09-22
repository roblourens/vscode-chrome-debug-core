import { IBPRecipie } from './bpRecipie';
import { ITelemetryPropertyCollector } from '../../..';
import { PausedEvent } from '../../target/events';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locations/location';
import { BPRecipiesInUnresolvedSource } from './bpRecipies';
import { Breakpoint } from './breakpoint';
import { UnbindedBPLogic, UnbindedBPLogicDependencies } from './unbindedBPLogic';
import { asyncMap } from '../../collections/async';
import { IBPRecipieStatus } from './bpRecipieStatus';
import { ClientCurrentBPRecipiesRegistry } from './clientCurrentBPRecipiesRegistry';
import { BreakpointsRegistry } from './breakpointsRegistry';
import { Communicator } from '../../communication/communicator';
import { Internal } from '../../communication/internalChannels';
import { BPRecipieInLoadedSourceLogic, BPRInLoadedSourceLogicDependencies } from './bpRecipieInLoadedSourceLogic';
import { RemoveProperty } from '../../../typeUtils';
import { combine } from '../../utils/combine';
import { ILoadedSource } from '../sources/loadedSource';
import { BPStatusChangedParameters } from '../../client/eventSender';
import { PauseScriptLoadsToSetBPs, BPsWhileLoadingLogicDependencies } from './pauseScriptLoadsToSetBPs';

// interface IHitConditionBreakpoint {
//     numHits: number;
//     shouldPause: (numHits: number) => boolean;
// }

export interface IOnPausedResult {
    didPause: boolean;
}

export interface InternalDependencies extends
    UnbindedBPLogicDependencies,
    BPsWhileLoadingLogicDependencies,
    BPRInLoadedSourceLogicDependencies {
    sendBPStatusChanged(params: BPStatusChangedParameters): Promise<void>;

    onAsyncBreakpointResolved(listener: (params: Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>) => void): void;
}

export type BreakpointsLogicDependencies = RemoveProperty<InternalDependencies, 'waitUntilUnbindedBPsAreSet' | 'notifyAllBPsAreBinded'>;

export class BreakpointsLogic {
    private readonly _clientBreakpointsRegistry = new ClientCurrentBPRecipiesRegistry();
    private readonly _breakpointRegistry: BreakpointsRegistry;
    private readonly _unbindedBreakpointsLogic: UnbindedBPLogic;
    private readonly _bpsWhileLoadingLogic: PauseScriptLoadsToSetBPs;
    private readonly _bprInLoadedSourceLogic: BPRecipieInLoadedSourceLogic;

    public async onPaused(_notification: PausedEvent): Promise<IOnPausedResult> {
        // DIEGO TODO: Implement this
        // // Did we hit a hit condition breakpoint?
        // for (let hitBp of notification.hitBreakpoints) {
        //     if (this._hitConditionBreakpointsById.has(hitBp)) {
        //         // Increment the hit count and check whether to pause
        //         const hitConditionBp = this._hitConditionBreakpointsById.get(hitBp);
        //         hitConditionBp.numHits++;
        //         // Only resume if we didn't break for some user action (step, pause button)
        //         if (!hitConditionBp.shouldPause(hitConditionBp.numHits)) {
        //             this.targetDebuggerResume()
        //                 .catch(() => { });
        //             return { didPause: false };
        //         }
        //     }
        // }

        return { didPause: false };
    }

    protected onAsyncBreakpointResolved(breakpoint: Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._breakpointRegistry.registerBreakpointAsBinded(breakpoint);
        this.onUnbounBPRecipieIsNowBound(breakpoint.recipie);
    }

    private onUnbounBPRecipieIsNowBound(bpRecipie: IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        const bpRecipieStatus = this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie);
        this._dependencies.sendBPStatusChanged({ reason: 'changed', bpRecipieStatus });
    }

    public async setBreakpoints(requestedBPs: BPRecipiesInUnresolvedSource, _?: ITelemetryPropertyCollector): Promise<IBPRecipieStatus[]> {
        const bpsDelta = this._clientBreakpointsRegistry.updateBPRecipiesAndCalculateDelta(requestedBPs);
        const requestedBPsToAdd = new BPRecipiesInUnresolvedSource(bpsDelta.resource, bpsDelta.requestedToAdd);
        bpsDelta.requestedToAdd.forEach(requestedBP => this._breakpointRegistry.registerBPRecipie(requestedBP));
        bpsDelta.existingToBeReplaced.forEach(existingToBeReplaced => this._breakpointRegistry.registerBPRecipie(existingToBeReplaced.replacement));

        await requestedBPsToAdd.tryGettingBPsInLoadedSource(
            async requestedBPsToAddInLoadedSources => {
                // Match desired breakpoints to existing breakpoints

                await asyncMap(requestedBPsToAddInLoadedSources.breakpoints, async requestedBP => {
                    // DIEGO TODO: Do we need to do one breakpoint at a time to avoid issues on Crdp, or can we do them in parallel now that we use a different algorithm?
                    await this._bprInLoadedSourceLogic.addBreakpoint(requestedBP);
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
                    await this._bprInLoadedSourceLogic.addBreakpoint(existingToBeReplaced.replacement.asBreakpointInLoadedSource());
                });
            },
            () => {
                const existingUnbindedBPs = bpsDelta.existingToLeaveAsIs.filter(bp => !this._breakpointRegistry.getStatusOfBPRecipie(bp).isVerified());
                const requestedBPsPendingToAdd = new BPRecipiesInUnresolvedSource(bpsDelta.resource, bpsDelta.requestedToAdd.concat(existingUnbindedBPs));
                this._bpsWhileLoadingLogic.enableIfNeccesary();
                this._unbindedBreakpointsLogic.replaceBPsForSourceWith(requestedBPsPendingToAdd);
            });

        return bpsDelta.matchesForRequested.map(bpRecipie => this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie));
    }

    constructor(private readonly _dependencies: BreakpointsLogicDependencies) {
        const internalDependencies = combine(this._dependencies, {
            notifyAllBPsAreBinded: () => this._bpsWhileLoadingLogic.disableIfNeccesary(),
            waitUntilUnbindedBPsAreSet: (source: ILoadedSource) => this._unbindedBreakpointsLogic.waitUntilBPsAreSet(source)
        });

        this._breakpointRegistry = new BreakpointsRegistry();
        this._unbindedBreakpointsLogic = new UnbindedBPLogic(internalDependencies);
        this._bpsWhileLoadingLogic = new PauseScriptLoadsToSetBPs(internalDependencies, this._breakpointRegistry);
        this._bprInLoadedSourceLogic = new BPRecipieInLoadedSourceLogic(internalDependencies, this._breakpointRegistry);

        this._dependencies.onAsyncBreakpointResolved(breakpoint => this.onAsyncBreakpointResolved(breakpoint));
    }

    public static createWithHandlers(communicator: Communicator, dependencies: BreakpointsLogicDependencies) {
        const breakpointsLogic = new BreakpointsLogic(dependencies);
        communicator.registerHandler(Internal.Breakpoints.UpdateBreakpointsForFile, requestedBPs => breakpointsLogic.setBreakpoints(requestedBPs));
        communicator.registerHandler(Internal.Breakpoints.AddBreakpointForLoadedSource, requestedBP => breakpointsLogic._bprInLoadedSourceLogic.addBreakpoint(requestedBP));
        return breakpointsLogic;
    }
}