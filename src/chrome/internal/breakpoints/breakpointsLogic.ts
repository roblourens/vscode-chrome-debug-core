import { BPRecipieInLoadedSource, BPRecipie } from './bpRecipie';
import { newResourceIdentifierMap, IResourceIdentifier } from '../resourceIdentifier';
import { INewSetBreakpointResult } from '../../target/requests';
import { Crdp, ITelemetryPropertyCollector, LineColTransformer } from '../../..';
import { IScript } from '../script';
import { PromiseDefer, promiseDefer } from '../../../utils';
import { PausedEvent } from '../../target/events';
import { logger } from 'vscode-debugadapter/lib/logger';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';
import { BreakOnLoadHelper } from '../../breakOnLoadHelper';
import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { ConditionalBreak, AlwaysBreak } from './bpBehavior';
import { IBreakpoint, Breakpoint } from './breakpoint';
import { UnbindedBreakpointsLogic } from './unbindedBreakpointsLogic';
import { asyncMap } from '../../collections/async';
import { IBPRecipieStatus } from './bpRecipieStatus';
import { ClientBPRecipiesRegistry } from './clientBPRecipiesRegistry';
import { BPRecipieStatusRegistry } from './breakpointsRegistry';
import { Communicator } from '../../communication/communicator';
import { Target } from '../../communication/targetChannels';
import { ILoadedSource } from '../loadedSource';
import { Client } from '../../communication/clientChannels';
import { Internal } from '../../communication/internalChannels';

interface IHitConditionBreakpoint {
    numHits: number;
    shouldPause: (numHits: number) => boolean;
}

export interface IOnPausedResult {
    didPause: boolean;
}

export class BreakpointsLogic {

    private _committedBreakpointsByUrl = newResourceIdentifierMap<INewSetBreakpointResult[]>();
    private _hitConditionBreakpointsById: Map<Crdp.Debugger.BreakpointId, IHitConditionBreakpoint>;

    private _columnBreakpointsEnabled: boolean;

    // Promises so ScriptPaused events can wait for ScriptParsed events to finish resolving breakpoints
    private _scriptIdToBreakpointsAreResolvedDefer = new Map<IScript, PromiseDefer<void>>();
    private breakOnLoadActive = false;
    private readonly _breakOnLoadHelper: BreakOnLoadHelper;
    private readonly _clientBreakpointsRegistry = new ClientBPRecipiesRegistry();
    private readonly _unbindedBreakpointsLogic = new UnbindedBreakpointsLogic(this._communicator);
    private readonly _breakpointRegistry = new BPRecipieStatusRegistry();

    // Target Requests
    private readonly doesTargetSupportColumnBreakpoints = this._communicator.getRequester(Target.Debugger.SupportsColumnBreakpoints);
    private readonly targetDebuggerResume = this._communicator.getRequester(Target.Debugger.Resume);
    private readonly targetDebuggerSetBreakpoint = this._communicator.getRequester(Target.Debugger.SetBreakpoint);
    private readonly targetDebuggerSetBreakpointByUrl = this._communicator.getRequester(Target.Debugger.SetBreakpointByUrl);
    private readonly targetDebuggerSetBreakpointByUrlRegexp = this._communicator.getRequester(Target.Debugger.SetBreakpointByUrlRegexp);
    private readonly targetDebuggerRemoveBreakpoint = this._communicator.getRequester(Target.Debugger.RemoveBreakpoint);

    // Client Requests
    private readonly clientSendBPStatusChanged = this._communicator.getRequester(Client.EventSender.SendBPStatusChanged);

    constructor(private readonly _communicator: Communicator,
        private readonly _lineColTransformer: LineColTransformer) {
        this._hitConditionBreakpointsById = new Map<Crdp.Debugger.BreakpointId, IHitConditionBreakpoint>();
        this._communicator.registerHandler(Internal.Breakpoints.SetBreakpoints, requestedBPs => this.setBreakpoints(requestedBPs));
        this._communicator.registerHandler(Internal.Breakpoints.OnUnbounBPRecipieIsNowBound,
            (bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>) => this.onUnbounBPRecipieIsNowBound(bpRecipie));

    }

    public get committedBreakpointsByUrl(): Map<IResourceIdentifier, INewSetBreakpointResult[]> {
        return this._committedBreakpointsByUrl;
    }

    protected clearTargetContext(): void {
        this._committedBreakpointsByUrl = newResourceIdentifierMap<INewSetBreakpointResult[]>();
    }

    public hookConnectionEvents(): void {
        this._communicator.subscribe(Target.Debugger.OnAsyncBreakpointResolved, breakpoint => this.onAsyncBreakpointResolved(breakpoint));
    }

    public async detectColumnBreakpointSupport(): Promise<void> {
        this._lineColTransformer.columnBreakpointsEnabled = this._columnBreakpointsEnabled = await this.doesTargetSupportColumnBreakpoints();
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

    public async resolvePendingBreakpoint(_pendingBP: {
        ids: number[];
        requestSeq: number;
        setWithPath: string;
    }): Promise<void> {
        // this._session.sendEvent(new BreakpointEvent('changed', bp));
    }

    protected onAsyncBreakpointResolved(breakpoint: Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._breakpointRegistry.registerBreakpointAsBinded(breakpoint);
        this.onUnbounBPRecipieIsNowBound(breakpoint.recipie);
    }

    private onUnbounBPRecipieIsNowBound(bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        const bpRecipieStatus = this._breakpointRegistry.getStatusOfBPRecipieInLoadedSource(bpRecipie);
        this.clientSendBPStatusChanged({ reason: 'changed', bpRecipieStatus });
    }

    public async addBreakpoint(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[]> {
        const bpInScriptRecipie = bpRecipie.asBPInScriptRecipie();
        const runtimeSource = bpInScriptRecipie.locationInResource.script.runtimeSource;
        // TODO DIEGO: Understand why are we calling getBestActualLocationForBreakpoint
        // const bestActualLocation = await this.getBestActualLocationForBreakpoint(bpInScriptRecipie.locationInResource);
        let breakpoints: IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[];
        if (!runtimeSource.doesScriptHasUrl()) {
            breakpoints = [await this.targetDebuggerSetBreakpoint(bpInScriptRecipie)];
        } else if (runtimeSource.identifier.isLocalFilePath()) {
            breakpoints = await this.targetDebuggerSetBreakpointByUrlRegexp(bpInScriptRecipie.asBPInUrlRegexpRecipie());
        } else { // The script has a URL and it's not a local file path, so we can leave it as-is
            breakpoints = await this.targetDebuggerSetBreakpointByUrl(bpInScriptRecipie.asBPInUrlRecipie());
        }

        breakpoints.forEach(breakpoint => this._breakpointRegistry.registerBreakpointAsBinded(breakpoint));

        return breakpoints;
    }

    public removeBreakpoint(bpRecipie: BPRecipie<ILoadedSource>): Promise<void> {
        return this.targetDebuggerRemoveBreakpoint(bpRecipie);
    }

    /* __GDPR__
        'ClientRequest/setBreakpoints' : {
            '${include}': [
                '${IExecutionResultTelemetryProperties}',
                '${DebugCommonProperties}'
            ]
        }
    */
    public async setBreakpoints(requestedBPs: BPRecipiesInUnbindedSource, _?: ITelemetryPropertyCollector): Promise<IBPRecipieStatus[]> {
        return await requestedBPs.tryGettingBPsInLoadedSource(
            async desiredBPsInLoadedSource => {
                // Match desired breakpoints to existing breakpoints
                const match = this._clientBreakpointsRegistry.matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource);
                await asyncMap(match.desiredToAdd, async desiredBP => {
                    // DIEGO TODO: Do we need to do one breakpoint at a time to avoid issues on Crdp, or can we do them in parallel now that we use a different algorithm?
                    await this.addBreakpoint(desiredBP);
                });
                await Promise.all(match.existingToRemove.map(async existingBPToRemove => {
                    await this.removeBreakpoint(existingBPToRemove);
                }));

                return match.matchesForDesired.map(bpRecipie => this._breakpointRegistry.getStatusOfBPRecipieInLoadedSource(bpRecipie));
            },
            () => {
                return this._unbindedBreakpointsLogic.setBreakpoints(requestedBPs);
            });
    }

    public async resolvePendingBreakpointsOnScriptParsed(script: IScript) {
        const breakpointsAreResolvedDefer = this.getBreakpointsResolvedDefer(script);
        try {
            await Promise.all(script.allSources.map(async _sourceObj => {
                // DIEGO TODO: RE-ENABLE THIS CODE
                // let source = sourceObj.identifier; // DIEGO TODO: Use the source object instead
                // const pendingBP = this._pendingBreakpointsByUrl.get(source);
                // if (pendingBP && (!pendingBP.setWithPath || parseResourceIdentifier(pendingBP.setWithPath).isEquivalent(source))) {
                //     logger.log(`OnScriptParsed.resolvePendingBPs: Resolving pending breakpoints: ${JSON.stringify(pendingBP)}`);
                //     await this.resolvePendingBreakpoint(pendingBP);
                //     this._pendingBreakpointsByUrl.delete(sourceObj.identifier);
                // } else if (source) {
                //     const sourceFileName = path.basename(source.canonicalized);
                //     if (Array.from(this._pendingBreakpointsByUrl.keys()).find(key => key.canonicalized.indexOf(sourceFileName) > -1)) {
                //         logger.log(`OnScriptParsed.resolvePendingBPs: The following pending breakpoints won't be resolved: ${JSON.stringify(pendingBP)} pendingBreakpointsByUrl = ${JSON.stringify([...this._pendingBreakpointsByUrl])} source = ${source}`);
                //     }
                // }
            }));
            breakpointsAreResolvedDefer.resolve(); // By now no matter which code path we choose, resolving pending breakpoints should be finished, so trigger the defer
        } catch (exception) {
            breakpointsAreResolvedDefer.reject(exception);
        }
    }

}