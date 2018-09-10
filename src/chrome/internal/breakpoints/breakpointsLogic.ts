import { INewSetBreakpointsArgs, BPRecipieInLoadedSource, BreakpointRecipie } from './breakpointRecipie';
import { DebugProtocol } from 'vscode-debugprotocol';
import { newResourceIdentifierMap, IResourceIdentifier } from '../resourceIdentifier';
import { INewSetBreakpointResult } from '../../target/requests';
import { utils, Crdp, ITelemetryPropertyCollector, LineColTransformer, BaseSourceMapTransformer } from '../../..';
import { IScript } from '../script';
import { PromiseDefer, promiseDefer } from '../../../utils';
import { PausedEvent } from '../../target/events';
import { logger } from 'vscode-debugadapter/lib/logger';
import { BreakpointEvent } from 'vscode-debugadapter';
import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { BreakOnLoadHelper } from '../../breakOnLoadHelper';
import { ISession } from '../../client/delayMessagesUntilInitializedSession';
import { BasePathTransformer } from '../../../transformers/basePathTransformer';
import { ClientBPsRegistry } from './breakpointsRegistry';
import { BreakpointRecipiesInUnbindedSource } from './breakpointRecipies';
import { ConditionalBreak, AlwaysBreak } from './behaviorRecipie';
import { IBreakpoint, BPRecipieIsBinded } from './breakpoint';
import { asyncMap } from '../../collections/async';
import { UnbindedBreakpointsLogic } from './UnbindedBreakpointsLogic';

export interface IPendingBreakpoint {
    args: INewSetBreakpointsArgs;
    ids: number[];
    requestSeq: number;
    setWithPath: string;
}

interface IHitConditionBreakpoint {
    numHits: number;
    shouldPause: (numHits: number) => boolean;
}

export interface BreakpointSetResult {
    isSet: boolean;
    breakpoint: DebugProtocol.Breakpoint;
}

export interface IOnPausedResult {
    didPause: boolean;
}

export class BreakpointsLogic {

    private _committedBreakpointsByUrl = newResourceIdentifierMap<INewSetBreakpointResult[]>();
    private _breakpointIdHandles: utils.ReverseHandles<Crdp.Debugger.BreakpointId>;
    private _pendingBreakpointsByUrl = newResourceIdentifierMap<IPendingBreakpoint>();
    private _hitConditionBreakpointsById: Map<Crdp.Debugger.BreakpointId, IHitConditionBreakpoint>;

    private _columnBreakpointsEnabled: boolean;

    // Promises so ScriptPaused events can wait for ScriptParsed events to finish resolving breakpoints
    private _scriptIdToBreakpointsAreResolvedDefer = new Map<IScript, PromiseDefer<void>>();
    private breakOnLoadActive = false;
    private readonly _breakOnLoadHelper: BreakOnLoadHelper;
    private readonly _session: ISession;
    private readonly _pathTransformer: BasePathTransformer;
    private readonly _sourceMapTransformer: BaseSourceMapTransformer;
    private readonly _clientBreakpointsRegistry = new ClientBPsRegistry();
    private readonly _unbindedBreakpointsLogic = new UnbindedBreakpointsLogic();

    constructor(private readonly chrome: CDTPDiagnostics,
        private readonly _lineColTransformer: LineColTransformer) {
        this._breakpointIdHandles = new utils.ReverseHandles<Crdp.Debugger.BreakpointId>();
        this._pendingBreakpointsByUrl = newResourceIdentifierMap<IPendingBreakpoint>();
        this._hitConditionBreakpointsById = new Map<Crdp.Debugger.BreakpointId, IHitConditionBreakpoint>();
    }

    public get pendingBreakpointsByUrl(): Map<IResourceIdentifier, IPendingBreakpoint> {
        return this._pendingBreakpointsByUrl;
    }

    public get committedBreakpointsByUrl(): Map<IResourceIdentifier, INewSetBreakpointResult[]> {
        return this._committedBreakpointsByUrl;
    }

    protected clearTargetContext(): void {
        this._committedBreakpointsByUrl = newResourceIdentifierMap<INewSetBreakpointResult[]>();
    }

    public hookConnectionEvents(): void {
        this.chrome.Debugger.onBreakpointResolved((params, runtimeScript) => this.onBreakpointResolved(params, runtimeScript));
    }

    public async detectColumnBreakpointSupport(): Promise<void> {
        this._lineColTransformer.columnBreakpointsEnabled = this._columnBreakpointsEnabled = await this.chrome.Debugger.supportsColumnBreakpoints();
    }

    public async onPaused(notification: PausedEvent): Promise<IOnPausedResult> {
        // If break on load is active, we pass the notification object to breakonload helper
        // If it returns true, we continue and return
        if (this.breakOnLoadActive) {
            let shouldContinue = await this._breakOnLoadHelper.handleOnPaused(notification);
            if (shouldContinue) {
                this.chrome.Debugger.resume()
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
                    this.chrome.Debugger.resume()
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
        args: INewSetBreakpointsArgs;
        ids: number[];
        requestSeq: number;
        setWithPath: string;
    }): Promise<void> {
        // this._session.sendEvent(new BreakpointEvent('changed', bp));
    }

    protected onBreakpointResolved(breakpointCrdpId: Crdp.Debugger.BreakpointId, location: LocationInScript): void {
        const breakpointId = this._breakpointIdHandles.lookup(breakpointCrdpId);
        if (!breakpointId) {
            // Breakpoint resolved for a script we don't know about or a breakpoint we don't know about
            return;
        }

        // If the breakpoint resolved is a stopOnEntry breakpoint, we just return since we don't need to send it to client
        if (this.breakOnLoadActive && this._breakOnLoadHelper.stopOnEntryBreakpointIdToRequestedFileName.has(breakpointCrdpId)) {
            return;
        }

        const committedBps = this._committedBreakpointsByUrl.get(location.script.runtimeSource.identifier) || [];
        if (!committedBps.find(committedBp => committedBp.breakpointId === breakpointCrdpId)) {
            committedBps.push({ breakpointId: breakpointCrdpId, actualLocation: location });
        }
        this._committedBreakpointsByUrl.set(location.script.runtimeSource.identifier, committedBps);

        const bp = <DebugProtocol.Breakpoint>{
            id: breakpointId,
            verified: true,
            line: location.lineNumber,
            column: location.columnNumber
        };
        const scriptPath = this._pathTransformer.breakpointResolved(bp, location.script.runtimeSource.identifier);

        if (this._pendingBreakpointsByUrl.has(scriptPath)) {
            // If we set these BPs before the script was loaded, remove from the pending list
            this._pendingBreakpointsByUrl.delete(scriptPath);
        }
        this._sourceMapTransformer.breakpointResolved(bp, scriptPath.canonicalized);
        this._lineColTransformer.breakpointResolved(bp);
        this._session.sendEvent(new BreakpointEvent('changed', bp));
    }

    public async addBreakpoint(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>): Promise<IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[]> {
        const bpInScriptRecipie = bpRecipie.asBPInScriptRecipie();
        const runtimeSource = bpInScriptRecipie.locationInResource.script.runtimeSource;
        // TODO DIEGO: Understand why are we calling getBestActualLocationForBreakpoint
        // const bestActualLocation = await this.getBestActualLocationForBreakpoint(bpInScriptRecipie.locationInResource);
        let breakpoints;
        if (!runtimeSource.doesScriptHasUrl()) {
            breakpoints = [await this.chrome.Debugger.setBreakpoint(bpInScriptRecipie)];
        } else if (runtimeSource.identifier.isLocalFilePath()) {
            breakpoints =  await this.chrome.Debugger.setBreakpointByUrlRegexp(bpInScriptRecipie.asBPInUrlRegexpRecipie());
        } else { // The script has a URL and it's not a local file path, so we can leave it as-is
            breakpoints = await this.chrome.Debugger.setBreakpointByUrl(bpInScriptRecipie.asBPInUrlRecipie());
        }

        return breakpoints;
    }

    public removeBreakpoint(bpRecipie: BreakpointRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>) {
        this.chrome.Debugger.removeBreakpoint(bpRecipie);
    }

    /* __GDPR__
        'ClientRequest/setBreakpoints' : {
            '${include}': [
                '${IExecutionResultTelemetryProperties}',
                '${DebugCommonProperties}'
            ]
        }
    */
    public async setBreakpoints(desiredBPs: BreakpointRecipiesInUnbindedSource, _?: ITelemetryPropertyCollector): Promise<BPRecipieIsBinded[]> {
        return await desiredBPs.tryGettingBPsInLoadedSource(
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

                return match.matchesForDesired.map(bpRecipie => this._clientBreakpointsRegistry.getStatus(bpRecipie));
            },
            () => {
                return this._unbindedBreakpointsLogic.setBreakpoints(desiredBPs);
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