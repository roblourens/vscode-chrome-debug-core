import { INewSetBreakpointsArgs, BPRecipieInLoadedSource, BreakpointRecipie } from './breakpointRecipie';
import { DebugProtocol } from 'vscode-debugprotocol';
import { newResourceIdentifierMap, IResourceIdentifier, parseResourceIdentifier } from '../resourceIdentifier';
import { INewSetBreakpointResult } from '../../target/requests';
import { utils, Crdp, ITelemetryPropertyCollector, ISetBreakpointsResponseBody, LineColTransformer, BaseSourceMapTransformer } from '../../..';
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
import * as path from 'path';
import { ClientBPsRegistry } from './breakpointsRegistry';
import { BreakpointRecipiesInUnbindedSource } from './breakpointRecipies';
import { ConditionalBreak, AlwaysBreak } from './behaviorRecipie';

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

    public async addBreakpoint(bpRecipie: BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>) {
        const bpInScriptRecipie = bpRecipie.asBPInScriptRecipie();
        const runtimeSource = bpInScriptRecipie.locationInResource.script.runtimeSource;
        // TODO DIEGO: Understand why are we calling getBestActualLocationForBreakpoint
        // const bestActualLocation = await this.getBestActualLocationForBreakpoint(bpInScriptRecipie.locationInResource);
        if (runtimeSource.doesScriptHasUrl()) {
            this.chrome.Debugger.setBreakpoint(bpInScriptRecipie);
        } else {
            if (runtimeSource.identifier.isLocalFilePath()) {
                this.chrome.Debugger.setBreakpointByUrlRegexp(bpInScriptRecipie.asBPInUrlRegexpRecipie());
            } else {
                this.chrome.Debugger.setBreakpointByUrl(bpInScriptRecipie.asBPInUrlRecipie());
            }
        }
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
    public async setBreakpoints(desiredBPs: BreakpointRecipiesInUnbindedSource, _?: ITelemetryPropertyCollector, _requestSeq?: number, _ids?: number[]): Promise<ISetBreakpointsResponseBody> {
        await desiredBPs.tryGettingBPsInLoadedSource(
            desiredBPsInLoadedSource => {
                // Match desired breakpoints to existing breakpoints
                const match = this._clientBreakpointsRegistry.matchDesiredBPsWithExistingBPs(desiredBPsInLoadedSource);
                match.desiredToAdd.forEach(desiredBP => {
                    this.addBreakpoint(desiredBP);
                });
                match.existingToRemove.forEach(() => { });
                return match.matchesForDesired;
            },
            () => {
                // Add to pending breakpoints
            });
        return {} as ISetBreakpointsResponseBody;
        /*
                            const setBreakpointsPFailOnError = this._setBreakpointsRequestQ
                                .then(() => this.clearAllBreakpoints(targetScriptUrl))
                                .then(() => this.addBreakpoints(targetScriptUrl.textRepresentation, internalBPs, script))
                                .then(responses => ({ breakpoints: this.targetBreakpointResponsesToBreakpointSetResults(targetScriptUrl, responses, internalBPs, ids) }));

                            const setBreakpointsPTimeout = utils.promiseTimeout(setBreakpointsPFailOnError, BreakpointsLogic.SET_BREAKPOINTS_TIMEOUT, localize('setBPTimedOut', 'Set breakpoints request timed out'));

                            // Do just one setBreakpointsRequest at a time to avoid interleaving breakpoint removed/breakpoint added requests to Crdp, which causes issues.
                            // Swallow errors in the promise queue chain so it doesn't get blocked, but return the failing promise for error handling.
                            this._setBreakpointsRequestQ = setBreakpointsPTimeout.catch(e => {
                                // Log the timeout, but any other error will be logged elsewhere
                                if (e.message && e.message.indexOf('timed out') >= 0) {
                                    logger.error(e.stack);
                                }
                            });

                            // Return the setBP request, no matter how long it takes. It may take awhile in Node 7.5 - 7.7, see https://github.com/nodejs/node/issues/11589
                            return setBreakpointsPFailOnError.then(setBpResultBody => {
                                const body = { breakpoints: setBpResultBody.breakpoints.map(setBpResult => setBpResult.breakpoint) };
                                if (body.breakpoints.every(bp => !bp.verified)) {
                                    // We need to send the original args to avoid adjusting the line and column numbers twice here
                                    return this.unverifiedBpResponseForBreakpoints(originalArgs, requestSeq, targetScriptUrl.textRepresentation, body.breakpoints, localize('bp.fail.unbound', 'Breakpoint set but not yet bound'));
                                }
                                this._sourceMapTransformer.setBreakpointsResponse(body, requestSeq);
                                this._lineColTransformer.setBreakpointsResponse(body);
                                return body;
                            });
                        } else {
                            return Promise.resolve(this.unverifiedBpResponse(args, requestSeq, undefined, localize('bp.fail.noscript', "Can't find script for breakpoint request")));
                        }
                    },
                        e => this.unverifiedBpResponse(args, requestSeq, undefined, e.message));
            */
    }

    public async resolvePendingBreakpointsOnScriptParsed(script: IScript) {
        const breakpointsAreResolvedDefer = this.getBreakpointsResolvedDefer(script);
        try {
            await Promise.all(script.allSources.map(async sourceObj => {
                let source = sourceObj.identifier; // DIEGO TODO: Use the source object instead
                const pendingBP = this._pendingBreakpointsByUrl.get(source);
                if (pendingBP && (!pendingBP.setWithPath || parseResourceIdentifier(pendingBP.setWithPath).isEquivalent(source))) {
                    logger.log(`OnScriptParsed.resolvePendingBPs: Resolving pending breakpoints: ${JSON.stringify(pendingBP)}`);
                    await this.resolvePendingBreakpoint(pendingBP);
                    this._pendingBreakpointsByUrl.delete(sourceObj.identifier);
                } else if (source) {
                    const sourceFileName = path.basename(source.canonicalized);
                    if (Array.from(this._pendingBreakpointsByUrl.keys()).find(key => key.canonicalized.indexOf(sourceFileName) > -1)) {
                        logger.log(`OnScriptParsed.resolvePendingBPs: The following pending breakpoints won't be resolved: ${JSON.stringify(pendingBP)} pendingBreakpointsByUrl = ${JSON.stringify([...this._pendingBreakpointsByUrl])} source = ${source}`);
                    }
                }
            }));
            breakpointsAreResolvedDefer.resolve(); // By now no matter which code path we choose, resolving pending breakpoints should be finished, so trigger the defer
        } catch (exception) {
            breakpointsAreResolvedDefer.reject(exception);
        }
    }

}