import { BPRecipie, IBPRecipie } from './bpRecipie';
import { INewSetBreakpointResult } from '../../target/requests';
import { Crdp, ITelemetryPropertyCollector } from '../../..';
import { IScript } from '../scripts/script';
import { PromiseDefer, promiseDefer } from '../../../utils';
import { PausedEvent } from '../../target/events';
import { logger } from 'vscode-debugadapter/lib/logger';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locations/locationInResource';
import { BreakOnLoadHelper } from '../../breakOnLoadHelper';
import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { Breakpoint } from './breakpoint';
import { UnbindedBPLogic, UnbindedBPLogicDependencies } from './unbindedBPLogic';
import { asyncMap } from '../../collections/async';
import { IBPRecipieStatus } from './bpRecipieStatus';
import { ClientCurrentBPRecipiesRegistry } from './clientCurrentBPRecipiesRegistry';
import { BreakpointsRegistry } from './breakpointsRegistry';
import { Communicator } from '../../communication/communicator';
import { Target } from '../../communication/targetChannels';
import { Client } from '../../communication/clientChannels';
import { Internal } from '../../communication/internalChannels';
import { newResourceIdentifierMap, IResourceIdentifier } from '../sources/resourceIdentifier';
import { BPRInLoadedSourceLogic } from './bprInLoadedSourceLogic';
import { BPsWhileLoadingLogic, BPsWhileLoadingLogicDependencies } from './bpsWhileLoadingLogic';
import { RemoveProperty } from '../../../typeUtils';

interface IHitConditionBreakpoint {
    numHits: number;
    shouldPause: (numHits: number) => boolean;
}

export interface IOnPausedResult {
    didPause: boolean;
}

export interface BreakpointsLogicDependencies extends RemoveProperty<UnbindedBPLogicDependencies & BPsWhileLoadingLogicDependencies,
    'waitUntilUnbindedBPsAreSet' | 'notifyAllBPsAreBinded'> {
    doesTargetSupportColumnBreakpoints: Promise<boolean>;
}

export class BreakpointsLogic {
    private _committedBreakpointsByUrl = newResourceIdentifierMap<INewSetBreakpointResult[]>();
    private _hitConditionBreakpointsById: Map<Crdp.Debugger.BreakpointId, IHitConditionBreakpoint>;

    // Promises so ScriptPaused events can wait for ScriptParsed events to finish resolving breakpoints
    private _scriptIdToBreakpointsAreResolvedDefer = new Map<IScript, PromiseDefer<void>>();
    private breakOnLoadActive = false;
    private readonly _breakOnLoadHelper: BreakOnLoadHelper;
    private readonly _clientBreakpointsRegistry = new ClientCurrentBPRecipiesRegistry();

    // Target Requests
    private readonly targetDebuggerResume = this._communicator.getRequester(Target.Debugger.Resume);

    // Client Requests
    private readonly clientSendBPStatusChanged = this._communicator.getRequester(Client.EventSender.SendBPStatusChanged);

    public get committedBreakpointsByUrl(): Map<IResourceIdentifier, INewSetBreakpointResult[]> {
        return this._committedBreakpointsByUrl;
    }

    protected clearTargetContext(): void {
        this._committedBreakpointsByUrl = newResourceIdentifierMap<INewSetBreakpointResult[]>();
    }

    public hookConnectionEvents(): void {
        this._communicator.subscribe(Target.Debugger.OnAsyncBreakpointResolved, breakpoint => this.onAsyncBreakpointResolved(breakpoint));
    }

    public async onPaused(notification: PausedEvent): Promise<IOnPausedResult> {
        // If break on load is active, we pass the notification object to breakonload helper
        // If it returns true, we continue and return
        if (this.breakOnLoadActive) {
            let shouldContinue = await this._breakOnLoadHelper.handleOnPaused(notification);
            if (shouldContinue) {
                this.targetDebuggerResume()
                    .catch(e => {
                        logger.error('Failed to resume due to exception: ' + e.message);
                    });
                return { didPause: false };
            }
        }

        // Did we hit a hit condition breakpoint?
        for (let hitBp of notification.hitBreakpoints) {
            if (this._hitConditionBreakpointsById.has(hitBp)) {
                // Increment the hit count and check whether to pause
                const hitConditionBp = this._hitConditionBreakpointsById.get(hitBp);
                hitConditionBp.numHits++;
                // Only resume if we didn't break for some user action (step, pause button)
                if (!hitConditionBp.shouldPause(hitConditionBp.numHits)) {
                    this.targetDebuggerResume()
                        .catch(() => { });
                    return { didPause: false };
                }
            }
        }

        return { didPause: false };
    }

    public getBreakpointsResolvedDefer(scriptId: IScript): PromiseDefer<void> {
        const existingValue = this._scriptIdToBreakpointsAreResolvedDefer.get(scriptId);
        if (existingValue) {
            return existingValue;
        } else {
            const newValue = promiseDefer<void>();
            this._scriptIdToBreakpointsAreResolvedDefer.set(scriptId, newValue);
            return newValue;
        }
    }

    protected onAsyncBreakpointResolved(breakpoint: Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._breakpointRegistry.registerBreakpointAsBinded(breakpoint);
        this.onUnbounBPRecipieIsNowBound(breakpoint.recipie);
    }

    private onUnbounBPRecipieIsNowBound(bpRecipie: IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        const bpRecipieStatus = this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie);
        this.clientSendBPStatusChanged({ reason: 'changed', bpRecipieStatus });
    }

    public async setBreakpoints(requestedBPs: BPRecipiesInUnbindedSource, _?: ITelemetryPropertyCollector): Promise<IBPRecipieStatus[]> {
        const bpsDelta = this._clientBreakpointsRegistry.updateBPRecipiesAndCalculateDelta(requestedBPs);
        const requestedBPsToAdd = new BPRecipiesInUnbindedSource(bpsDelta.resource, bpsDelta.requestedToAdd);
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
                this._bpsWhileLoadingLogic.enableIfNeccesary();
                this._unbindedBreakpointsLogic.replaceBPsForSourceWith(requestedBPsToAdd);
            });

        return bpsDelta.matchesForRequested.map(bpRecipie => this._breakpointRegistry.getStatusOfBPRecipie(bpRecipie));
    }

    constructor(private readonly _communicator: Communicator,
        _dependencies: BreakpointsLogicDependencies,
        private readonly _breakpointRegistry = new BreakpointsRegistry(),
        private readonly _unbindedBreakpointsLogic = new UnbindedBPLogic({
            addBreakpointForLoadedSource: _dependencies.addBreakpointForLoadedSource,
            sendClientBPStatusChanged: _dependencies.sendClientBPStatusChanged,
            notifyAllBPsAreBinded: () => _bpsWhileLoadingLogic.disableIfNeccesary()
        }),
        private readonly _bpsWhileLoadingLogic = new BPsWhileLoadingLogic({
            setInstrumentationBreakpoint: _dependencies.setInstrumentationBreakpoint,
            removeInstrumentationBreakpoint: _dependencies.removeInstrumentationBreakpoint,
            waitUntilUnbindedBPsAreSet: source => _unbindedBreakpointsLogic.waitUntilBPsAreSet(source)
        }),
        private readonly _bprInLoadedSourceLogic = new BPRInLoadedSourceLogic(_communicator, _breakpointRegistry, _dependencies.doesTargetSupportColumnBreakpoints)) {
        this._hitConditionBreakpointsById = new Map<Crdp.Debugger.BreakpointId, IHitConditionBreakpoint>();
        BreakpointsLogic.RegisterHandlers(this._communicator, this);

        this._communicator.subscribe(Target.Debugger.OnScriptParsed, scriptParsed =>
            asyncMap(scriptParsed.script.allSources, source => this._unbindedBreakpointsLogic.onLoadedSourceIsAvailable(source)));
    }

    public static RegisterHandlers(communicator: Communicator, breakpointsLogic: BreakpointsLogic) {
        communicator.registerHandler(Internal.Breakpoints.UpdateBreakpointsForFile, requestedBPs => breakpointsLogic.setBreakpoints(requestedBPs));
        communicator.registerHandler(Internal.Breakpoints.AddBreakpointForLoadedSource, requestedBP => breakpointsLogic._bprInLoadedSourceLogic.addBreakpoint(requestedBP));
        communicator.registerHandler(Internal.Breakpoints.OnUnbounBPRecipieIsNowBound,
            (bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>) => breakpointsLogic.onUnbounBPRecipieIsNowBound(bpRecipie));
    }
}