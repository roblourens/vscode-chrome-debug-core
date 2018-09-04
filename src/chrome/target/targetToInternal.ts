import { Crdp, BasePathTransformer, BaseSourceMapTransformer } from '../..';
import { IScript, Script } from '../internal/script';
import { RuntimeScriptsManager } from './runtimeScriptsManager';
import { ScriptParsedEvent, ExceptionDetails, LogEntry } from './events';
import { LocationInScript, ZeroBasedLocation, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../internal/locationInResource';
import { asyncUndefinedOnFailure } from '../internal/failures';
import { SourcesMapper, NoSourceMapping } from '../internal/sourcesMapper';
import { parseResourceIdentifier, IResourceIdentifier, ResourceName } from '../internal/resourceIdentifier';
import { CDTPScriptUrl } from '../internal/resourceIdentifierSubtypes';
import { BreakpointInScript, BreakpointInUrl, BreakpointInUrlRegexp, Breakpoint } from '../internal/breakpoints/breakpoint';
import { BPRecipieInUrl, BPRecipieInScript, BPRecipie, BPRecipieInUrlRegexp, URLRegexp, IBPRecipie } from '../internal/breakpoints/bpRecipie';
import { BreakpointIdRegistry } from './breakpointIdRegistry';
import { CodeFlowStackTrace } from '../internal/stackTraces/stackTrace';
import { CodeFlowFrame, CallFrame, ScriptCallFrame } from '../internal/stackTraces/callFrame';
import { createCallFrameName } from '../internal/stackTraces/callFrameName';
import { Scope } from '../internal/stackTraces/scopes';
import { LineNumber, ColumnNumber } from '../internal/locations/subtypes';

export type CDTPResource = IScript | URLRegexp | IResourceIdentifier<CDTPScriptUrl>;

interface HasLocation {
    lineNumber: number;
    columnNumber?: number;
}

interface HasScript {
    scriptId: Crdp.Runtime.ScriptId;
}

interface HasScriptLocation extends HasLocation, HasScript { }

interface BreakpointClass<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> {
    new(recipie: BPRecipie<TResource>, actualLocation: LocationInScript): Breakpoint<TResource>;
}

export class TargetToInternal {
    public toBPRecipie(breakpointId: Crdp.Debugger.BreakpointId): IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp> {
        return this._breakpointIdRegistry.getRecipieByBreakpointId(breakpointId);
    }

    public registerBreakpointId(cdtpBreakpointId: Crdp.Debugger.BreakpointId, bpRecipie: BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>): void {
        this._breakpointIdRegistry.registerRecipie(cdtpBreakpointId, bpRecipie);
    }

    public async toBreakpoinInResource<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> (classToUse: BreakpointClass<TResource>,
        bpRecipie: BPRecipie<TResource>, actualLocation: Crdp.Debugger.Location): Promise<Breakpoint<TResource>> {
        const breakpoint = new classToUse(bpRecipie, await this.toLocationInScript(actualLocation));
        return breakpoint;
    }

    public async toBreakpointInScript(bpRecipie: BPRecipieInScript, params: Crdp.Debugger.SetBreakpointResponse): Promise<BreakpointInScript> {
        return this.toBreakpoinInResource<IScript>(BreakpointInScript, bpRecipie, params.actualLocation);
    }

    public async toBreakpointInUrl(bpRecipie: BPRecipieInUrl, actualLocation: Crdp.Debugger.Location): Promise<BreakpointInUrl> {
        return this.toBreakpoinInResource<IResourceIdentifier>(BreakpointInUrl, bpRecipie, actualLocation);
    }

    public async toBreakpointInUrlRegexp(bpRecipie: BPRecipieInUrlRegexp, actualLocation: Crdp.Debugger.Location): Promise<BreakpointInUrlRegexp> {
        return this.toBreakpoinInResource<URLRegexp>(BreakpointInUrlRegexp, bpRecipie, actualLocation);
    }

    public async toScriptParsedEvent(params: Crdp.Debugger.ScriptParsedEvent): Promise<ScriptParsedEvent> {
        return {
            script: await this.toScript(params.scriptId),
            url: params.url,
            startLine: params.startLine,
            startColumn: params.startColumn,
            endLine: params.endLine,
            endColumn: params.endColumn,
            executionContextId: params.executionContextId,
            hash: params.hash,
            executionContextAuxData: params.executionContextAuxData,
            isLiveEdit: params.isLiveEdit,
            sourceMapURL: params.sourceMapURL,
            hasSourceURL: params.hasSourceURL,
            isModule: params.isModule,
            length: params.length,
            stackTrace: params.stackTrace && await this.toStackTraceCodeFlow(params.stackTrace)
        };
    }

    public async toStackTraceCodeFlow(stackTrace: NonNullable<Crdp.Runtime.StackTrace>): Promise<CodeFlowStackTrace<IScript>> {
        return {
            codeFlowFrames: await Promise.all(stackTrace.callFrames.map((callFrame, index) => this.RuntimetoCallFrameCodeFlow(index, callFrame))),
            description: stackTrace.description, parent: stackTrace.parent && await this.toStackTraceCodeFlow(stackTrace.parent)
        };
    }

    private async configurableToCallFrameCodeFlow(index: number, callFrame: Crdp.Runtime.CallFrame | Crdp.Debugger.CallFrame, location: HasScriptLocation): Promise<CodeFlowFrame<IScript>> {
        const scriptLocation = await this.getScriptLocation(location);
        const name = createCallFrameName(scriptLocation.script, callFrame.functionName);
        return new CodeFlowFrame(index, name, scriptLocation);
    }

    public RuntimetoCallFrameCodeFlow(index: number, callFrame: Crdp.Runtime.CallFrame): Promise<CodeFlowFrame<IScript>> {
        return this.configurableToCallFrameCodeFlow(index, callFrame, callFrame);
    }

    public DebuggertoCallFrameCodeFlow(index: number, callFrame: Crdp.Debugger.CallFrame): Promise<CodeFlowFrame<IScript>> {
        return this.configurableToCallFrameCodeFlow(index, callFrame, callFrame.location);
    }

    public async toCallFrame(index: number, callFrame: Crdp.Debugger.CallFrame): Promise<CallFrame<IScript>> {
        return new ScriptCallFrame(await this.DebuggertoCallFrameCodeFlow(index, callFrame),
            await Promise.all(callFrame.scopeChain.map(scope => this.toScope(scope))),
            callFrame.this, callFrame.returnValue);
    }

    public async toScope(scope: Crdp.Debugger.Scope): Promise<Scope> {
        return {
            type: scope.type,
            object: scope.object,
            name: scope.name,
            // TODO FILE BUG: Chrome sometimes returns line -1 when the doc says it's 0 based
            startLocation: await asyncUndefinedOnFailure(async () => scope.startLocation && await this.toLocationInScript(scope.startLocation)),
            endLocation: await asyncUndefinedOnFailure(async () => scope.endLocation && await this.toLocationInScript(scope.endLocation))
        };
    }

    public async toExceptionDetails(exceptionDetails: Crdp.Runtime.ExceptionDetails): Promise<ExceptionDetails> {
        return {
            exceptionId: exceptionDetails.exceptionId,
            text: exceptionDetails.text,
            lineNumber: exceptionDetails.lineNumber,
            columnNumber: exceptionDetails.columnNumber,
            script: exceptionDetails.scriptId ? await this.toScript(exceptionDetails.scriptId) : undefined,
            url: exceptionDetails.url,
            stackTrace: exceptionDetails.stackTrace && await this.toStackTraceCodeFlow(exceptionDetails.stackTrace),
            exception: exceptionDetails.exception,
            executionContextId: exceptionDetails.executionContextId,
        };
    }

    public toScript(scriptId: Crdp.Runtime.ScriptId): Promise<IScript> {
        return this._runtimeScriptsManager.getScriptById(scriptId);
    }

    public toLocationInScript(location: Crdp.Debugger.Location): Promise<LocationInScript> {
        return this.getScriptLocation(location);
    }

    public async toLogEntry(entry: Crdp.Log.LogEntry): Promise<LogEntry> {
        return {
            source: entry.source,
            level: entry.level,
            text: entry.text,
            timestamp: entry.timestamp,
            url: entry.url,
            lineNumber: entry.lineNumber,
            stackTrace: entry.stackTrace && await this.toStackTraceCodeFlow(entry.stackTrace),
            networkRequestId: entry.networkRequestId,
            workerId: entry.workerId,
            args: entry.args,
        };
    }

    public async createAndRegisterScript(params: Crdp.Debugger.ScriptParsedEvent): Promise<IScript> {
        // The stack trace and hash can be large and the DA doesn't need it.
        delete params.stackTrace;
        delete params.hash;

        const script = await this._runtimeScriptsManager.registerNewScript(params.scriptId, async () => {
            if (params.url !== undefined && params.url !== '') {
                const runtimeSourceLocation = parseResourceIdentifier<CDTPScriptUrl>(params.url as CDTPScriptUrl);
                const developmentSourceLocation = await this._pathTransformer.scriptParsed(runtimeSourceLocation);
                const sourceMap = await this._sourceMapTransformer.scriptParsed(developmentSourceLocation.canonicalized, params.sourceMapURL);
                const sourceMapper = sourceMap
                    ? new SourcesMapper(sourceMap)
                    : new NoSourceMapping();

                const runtimeScript = Script.create(runtimeSourceLocation, developmentSourceLocation, sourceMapper);
                return runtimeScript;
            } else {
                const sourceMap = await this._sourceMapTransformer.scriptParsed('', params.sourceMapURL);
                const sourceMapper = sourceMap
                    ? new SourcesMapper(sourceMap)
                    : new NoSourceMapping();
                const runtimeScript = Script.createEval(new ResourceName(params.scriptId as CDTPScriptUrl), sourceMapper);
                return runtimeScript;
            }
        });

        return script;
    }

    private getScript(crdpScript: HasScript): Promise<IScript> {
        return this.toScript(crdpScript.scriptId);
    }

    private getLocation(crdpLocation: HasLocation): ZeroBasedLocation {
        return new ZeroBasedLocation(crdpLocation.lineNumber as LineNumber, crdpLocation.columnNumber as ColumnNumber);
    }

    private async getScriptLocation(crdpScriptLocation: HasScriptLocation): Promise<LocationInScript> {
        return new LocationInScript(await this.getScript(crdpScriptLocation), this.getLocation(crdpScriptLocation));
    }

    constructor(
        private readonly _runtimeScriptsManager: RuntimeScriptsManager,
        private readonly _pathTransformer: BasePathTransformer,
        private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        private readonly _breakpointIdRegistry: BreakpointIdRegistry) { }
}
