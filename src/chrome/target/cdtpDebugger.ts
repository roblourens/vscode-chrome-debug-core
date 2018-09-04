import { CDTPDiagnosticsModule } from './cdtpDiagnosticsModule';
import { Crdp, utils } from '../..';
import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../internal/locationInResource';
import { PausedEvent, SetVariableValueRequest, ScriptParsedEvent } from './events';
import { IScript } from '../internal/script';
import { EvaluateOnCallFrameRequest } from './requests';
import { CallFrame } from '../internal/stackTraces';
import { TargetToInternal } from './targetToInternal';
import { InternalToTarget } from './internalToTarget';
import { BreakpointRecipieInScript, BreakpointRecipieInUrl, BreakpointRecipieInUrlRegexp, BPRecipie } from '../internal/breakpoints/bpRecipie';
import { AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpBehavior';
import { Breakpoint, BreakpointInScript, BreakpointInUrl, BreakpointInUrlRegexp } from '../internal/breakpoints/breakpoint';

export type ScriptParsedListener = (params: ScriptParsedEvent) => void;

export class CDTPDebugger extends CDTPDiagnosticsModule<Crdp.DebuggerApi> {
    private _onScriptParsedListeners: ScriptParsedListener[] = [];
    private _firstScriptWasParsed = utils.promiseDefer<Crdp.Runtime.ScriptId>();

    public onScriptParsed(listener: ScriptParsedListener): void {
        this._onScriptParsedListeners.push(listener);
    }

    public onBreakpointResolved(listener: (breakpoint: Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>) => void): void {
        return this.api.on('breakpointResolved', async params => {
            const bpRecipie = this._crdpToInternal.toBPRecipie(params.breakpointId);
            const breakpoint = new Breakpoint(bpRecipie,
                await this._crdpToInternal.toLocationInScript(params.location));
            listener(breakpoint);
        });
    }

    public onPaused(listener: (params: PausedEvent) => void): void {
        return this.api.on('paused', async params => {
            listener({
                reason: params.reason, data: params.data, hitBreakpoints: params.hitBreakpoints,
                asyncStackTrace: params.asyncStackTrace && await this._crdpToInternal.toStackTraceCodeFlow(params.asyncStackTrace),
                asyncStackTraceId: params.asyncStackTraceId, asyncCallStackTraceId: params.asyncCallStackTraceId,
                callFrames: await Promise.all(params.callFrames.map((callFrame, index) => this._crdpToInternal.toCallFrame(index, callFrame)))
            });
        });
    }

    public onResumed(listener: () => void): void {
        return this.api.on('resumed', listener);
    }

    public on(event: 'scriptFailedToParse', listener: (params: Crdp.Debugger.ScriptFailedToParseEvent) => void): void {
        return this.api.on(event, listener);
    }

    public enable(): Promise<Crdp.Debugger.EnableResponse> {
        return this.api.enable();
    }

    public setAsyncCallStackDepth(params: Crdp.Debugger.SetAsyncCallStackDepthRequest): Promise<void> {
        return this.api.setAsyncCallStackDepth(params);
    }

    public pauseOnAsyncCall(params: Crdp.Debugger.PauseOnAsyncCallRequest): Promise<void> {
        return this.api.pauseOnAsyncCall(params);
    }

    public resume(): Promise<void> {
        return this.api.resume();
    }

    public getPossibleBreakpoints(params: { start: LocationInScript, end?: LocationInScript, restrictToFunction?: boolean }): Promise<Crdp.Debugger.GetPossibleBreakpointsResponse> {
        return this.api.getPossibleBreakpoints({
            start: this._internalToCRDP.toCrdpLocation(params.start),
            end: params.end && this._internalToCRDP.toCrdpLocation(params.end),
            restrictToFunction: params.restrictToFunction
        });
    }

    public setBlackboxedRanges(script: IScript, positions: Crdp.Debugger.ScriptPosition[]): Promise<void> {
        return this.api.setBlackboxedRanges({ scriptId: this._internalToCRDP.getScriptId(script), positions: positions });
    }

    public setBlackboxPatterns(params: Crdp.Debugger.SetBlackboxPatternsRequest): Promise<void> {
        return this.api.setBlackboxPatterns(params);
    }

    public removeBreakpoint(bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): Promise<void> {
        return this.api.removeBreakpoint({ breakpointId: this._internalToCRDP.getBreakpointId(bpRecipie) });
    }

    public async setBreakpoint(bpRecipie: BreakpointRecipieInScript<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInScript> {
        const condition = this._internalToCRDP.getBPRecipieCondition(bpRecipie);

        const response = await this.api.setBreakpoint({ location: this._internalToCRDP.toCrdpLocation(bpRecipie.locationInResource), condition });

        return this._crdpToInternal.toBreakpointInScript(bpRecipie, response);
    }

    public async setBreakpointByUrl(bpRecipie: BreakpointRecipieInUrl<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInUrl[]> {
        const condition = this._internalToCRDP.getBPRecipieCondition(bpRecipie);
        const url = bpRecipie.locationInResource.resource.textRepresentation;
        const location = bpRecipie.locationInResource.location;

        const response = await this.api.setBreakpointByUrl({ url, lineNumber: location.lineNumber, columnNumber: location.columnNumber, condition });

        return Promise.all(response.locations.map(cdtpLocation => this._crdpToInternal.toBreakpointInUrl(bpRecipie, response.breakpointId, cdtpLocation)));
    }

    public async setBreakpointByUrlRegexp(bpRecipie: BreakpointRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>): Promise<BreakpointInUrlRegexp[]> {
        const condition = this._internalToCRDP.getBPRecipieCondition(bpRecipie);
        const urlRegex = bpRecipie.locationInResource.resource.textRepresentation;
        const location = bpRecipie.locationInResource.location;

        const response = await this.api.setBreakpointByUrl({ urlRegex, lineNumber: location.lineNumber, columnNumber: location.columnNumber, condition });

        return Promise.all(response.locations.map(cdtpLocation => this._crdpToInternal.toBreakpointInUrlRegexp(bpRecipie, response.breakpointId, cdtpLocation)));
    }

    public setPauseOnExceptions(params: Crdp.Debugger.SetPauseOnExceptionsRequest): Promise<void> {
        return this.api.setPauseOnExceptions(params);
    }

    public stepOver(): Promise<void> {
        return this.api.stepOver();
    }

    public stepInto(params: Crdp.Debugger.StepIntoRequest): Promise<void> {
        return this.api.stepInto(params);
    }

    public stepOut(): Promise<void> {
        return this.api.stepOut();
    }

    public pause(): Promise<void> {
        return this.api.pause();
    }

    public async getScriptSource(script: IScript): Promise<string> {
        return (await this.api.getScriptSource({ scriptId: this._internalToCRDP.getScriptId(script) })).scriptSource;
    }

    public evaluateOnCallFrame(params: EvaluateOnCallFrameRequest): Promise<Crdp.Debugger.EvaluateOnCallFrameResponse> {
        return this.api.evaluateOnCallFrame({
            callFrameId: this._internalToCRDP.getFrameId(params.frame.unmappedCallFrame),
            expression: params.expression,
            objectGroup: params.objectGroup,
            includeCommandLineAPI: params.includeCommandLineAPI,
            silent: params.silent,
            returnByValue: params.returnByValue,
            generatePreview: params.generatePreview,
            throwOnSideEffect: params.throwOnSideEffect,
            timeout: params.timeout,
        });
    }

    public setVariableValue(params: SetVariableValueRequest): Promise<void> {
        return this.api.setVariableValue({
            callFrameId: this._internalToCRDP.getFrameId(params.frame),
            scopeNumber: params.scopeNumber,
            variableName: params.variableName,
            newValue: params.newValue
        });
    }

    public restartFrame(frame: CallFrame<IScript>): Promise<Crdp.Debugger.RestartFrameResponse> {
        return this.api.restartFrame({ callFrameId: this._internalToCRDP.getFrameId(frame) });
    }

    protected onApiAvailable(): void {
        this.api.on('scriptParsed', async params => {
            // We resolve the promise waiting for the first script parse. This is used to detect column breakpoints support
            this._firstScriptWasParsed.resolve(params.scriptId);

            await this._crdpToInternal.createAndRegisterScript(params);

            this._onScriptParsedListeners.forEach(async listener => {
                listener(await this._crdpToInternal.toScriptParsedEvent(params));
            });

        });
    }

    public async supportsColumnBreakpoints(): Promise<boolean> {
        const scriptId = await this._firstScriptWasParsed.promise;

        try {
            await this.api.getPossibleBreakpoints({
                start: { scriptId, lineNumber: 0, columnNumber: 0 },
                end: { scriptId, lineNumber: 1, columnNumber: 0 },
                restrictToFunction: false
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    constructor(
        apiGetter: () => Crdp.DebuggerApi,
        private readonly _crdpToInternal: TargetToInternal,
        private readonly _internalToCRDP: InternalToTarget) {
        super(apiGetter);
    }
}
