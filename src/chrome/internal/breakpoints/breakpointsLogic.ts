import { INewSetBreakpointsArgs, BreakpointRecipiesInUnbindedSource, BreakpointRecipieInLoadedSource } from '../breakpoints';
import { DebugProtocol } from 'vscode-debugprotocol';
import { newResourceIdentifierMap, IResourceIdentifier, parseResourceIdentifier } from '../resourceIdentifier';
import { INewSetBreakpointResult } from '../../target/requests';
import { utils, Crdp, ITelemetryPropertyCollector, ISetBreakpointsResponseBody, InternalSourceBreakpoint, ChromeDebugLogic, LineColTransformer, BaseSourceMapTransformer, chromeUtils } from '../../..';
import { IScript } from '../script';
import { PromiseDefer, promiseDefer } from '../../../utils';
import { PausedEvent } from '../../target/events';
import { logger } from 'vscode-debugadapter/lib/logger';
import { BreakpointEvent } from 'vscode-debugadapter';
import { LocationInScript, ZeroBasedLocation } from '../locationInResource';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { BreakOnLoadHelper } from '../../breakOnLoadHelper';
import { ISession } from '../../client/delayMessagesUntilInitializedSession';
import { BasePathTransformer } from '../../../transformers/basePathTransformer';
import * as path from 'path';
import { ClientBPsRegistry } from './breakpointsRegistry';

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

    public resolvePendingBreakpoint(pendingBP: {
        args: INewSetBreakpointsArgs;
        ids: number[];
        requestSeq: number;
        setWithPath: string;
    }): Promise<void> {
        return this.setBreakpoints(pendingBP.args, null, pendingBP.requestSeq, pendingBP.ids).then((response: ISetBreakpointsResponseBody) => {
            response.breakpoints.forEach((bp: DebugProtocol.Breakpoint, i: number) => {
                bp.id = pendingBP.ids[i];
                this._session.sendEvent(new BreakpointEvent('changed', bp));
            });
        });
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

    public async addBreakpoint(breakpoint: BreakpointRecipieInLoadedSource) {
        const locationInScript = breakpoint.locationInResource.asLocationInScript();
        if (locationInScript.script.runtimeSource.doesScriptHasUrl()) {
            this.chrome.Debugger.setBreakpoint(locationInScript, breakpoint.behavior.condition);
        } else {
            const url = locationInScript.script.runtimeSource.identifier.textRepresentation;
            const urlRegexp = utils.pathToRegex(url);

            // TODO DIEGO: Understand why are we calling getBestActualLocationForBreakpoint
            const bestActualLocation = await this.getBestActualLocationForBreakpoint(locationInScript);
            this.chrome.Debugger.setBreakpointByUrl(urlRegexp, bestActualLocation, breakpoint.behavior.condition);
        }
    }

    private async getBestActualLocationForBreakpoint(location: LocationInScript): Promise<LocationInScript> {
        if (this._columnBreakpointsEnabled) {
            try {
                const possibleBPLocations = await this.chrome.Debugger.getPossibleBreakpoints({
                    start: LocationInScript.fromParameters(location.script, location.lineNumber, 0),
                    end: LocationInScript.fromParameters(location.script, location.lineNumber + 1, 0),
                    restrictToFunction: false
                });
                if (possibleBPLocations.locations.length > 0) {
                    const bestLocation = chromeUtils.selectBreakpointLocation(location.lineNumber, location.lineNumber, possibleBPLocations.locations);
                    return LocationInScript.fromParameters(location.script, bestLocation.lineNumber, bestLocation.columnNumber);
                }
            } catch (e) {
                // getPossibleBPs not supported
                // TODO DIEGO: Report telemetry
            }
        }
        return location;
    }

    public removeBreakpoint(breakpoint: BreakpointRecipieInLoadedSource) {
        const locationInScript = breakpoint.locationInResource.asLocationInScript();
        if (locationInScript.script.runtimeSource.doesScriptHasUrl()) {
            this.chrome.Debugger.setBreakpoint(locationInScript, breakpoint.behavior.condition);
        } else {

        }
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

    public async addBreakpoints(url: string, breakpoints: InternalSourceBreakpoint[], script: IScript | undefined): Promise<{
        breakpointId?: Crdp.Debugger.BreakpointId;
        actualLocation?: LocationInScript;
    }[]> {
        let responsePs: Promise<INewSetBreakpointResult>[];
        if (!script.runtimeSource.doesScriptHasUrl()) {
            // eval script with no real url - use debugger_setBreakpoint
            const scriptId: Crdp.Runtime.ScriptId = utils.lstrip(url, ChromeDebugLogic.EVAL_NAME_PREFIX);
            responsePs = breakpoints.map(({ line, column = 0, condition }) => this.chrome.Debugger.setBreakpoint({ scriptId, lineNumber: line, columnNumber: column }, condition));
        } else {
            // script that has a url - use debugger_setBreakpointByUrl so that Chrome will rebind the breakpoint immediately
            // after refreshing the page. This is the only way to allow hitting breakpoints in code that runs immediately when
            // the page loads.
            // If script has been parsed, script object won't be undefined and we would have the mapping file on the disk and we can directly set breakpoint using that
            if (!this.breakOnLoadActive || script) {
                const urlRegex = utils.pathToRegex(url);
                responsePs = breakpoints.map(({ line, column = 0, condition }) => {
                    return this.addOneBreakpointByUrl(script, urlRegex, line, column, condition);
                });
            } else { // Else if script hasn't been parsed and break on load is active, we need to do extra processing
                if (this.breakOnLoadActive) {
                    return await this._breakOnLoadHelper.handleAddBreakpoints(parseResourceIdentifier(url), breakpoints);
                }
            }
        }

        // Join all setBreakpoint requests to a single promise
        return Promise.all(responsePs);
    }

    private async addOneBreakpointByUrl(script: IScript | undefined, urlRegex: string, lineNumber: number, columnNumber: number,
        condition: string): Promise<{ breakpointId?: Crdp.Debugger.BreakpointId, actualLocation?: LocationInScript }> {
        let bpLocation = { lineNumber, columnNumber };

        let result;
        try {
            result = await this.chrome.Debugger.setBreakpointByUrl({ urlRegex, lineNumber: bpLocation.lineNumber, columnNumber: bpLocation.columnNumber, condition });
        } catch (e) {
            if (e.message === 'Breakpoint at specified location already exists.') {
                return {
                    actualLocation: new LocationInScript(script, bpLocation)
                };
            } else {
                throw e;
            }
        }

        // Now convert the response to a SetBreakpointResponse so both response types can be handled the same
        const locations = result.locations;
        return {
            breakpointId: result.breakpointId,
            actualLocation: locations[0] && new LocationInScript(script, locations[0])
        };
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