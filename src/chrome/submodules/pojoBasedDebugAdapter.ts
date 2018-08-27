import { IDebugAdapter, ITelemetryPropertyCollector, PromiseOrNot, ILaunchRequestArgs, IAttachRequestArgs, IThreadsResponseBody, ISetBreakpointsResponseBody, IStackTraceResponseBody, IScopesResponseBody, IVariablesResponseBody, ISourceResponseBody, IEvaluateResponseBody, ISetBreakpointsArgs, utils, LineColTransformer } from '../..';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ChromeDebugLogic } from '../chromeDebugAdapter';
import * as path from 'path';
import { telemetry } from '../../telemetry';
import { IChromeDebugAdapterOpts, ChromeDebugSession } from '../chromeDebugSession';
import * as ChromeUtils from '../chromeUtils';
import * as errors from '../../errors';
import * as internal from './breakpoints';
import { SourcesManager } from './sourcesManager';
import { ChromeConnection } from '../chromeConnection';
import { RuntimeScriptsManager } from './runtimeScriptsManager';
import { ChromeDiagnostics } from './chromeDiagnostics';
import { DelayMessagesUntilInitializedSession } from './delayMessagesUntilInitializedSession';
import { parseResourceLocationOrName } from './resourceLocation';
import { RemotePathTransformer } from '../../transformers/remotePathTransformer';
import { EagerSourceMapTransformer } from '../../transformers/eagerSourceMapTransformer';
import { IRuntimeScriptSource, ISourceIdentifier } from './loadedSource';
import { StepProgressEventsEmitter } from '../../executionTimingsReporter';

export class ChromeDebugAdapter implements IDebugAdapter {
    private readonly _sourceHandles = new utils.ReverseHandles<IRuntimeScriptSource>();
    protected readonly _chromeDebugAdapter: ChromeDebugLogic;
    private readonly _lineColTransformer: LineColTransformer;
    private readonly _sourcesManager: SourcesManager;
    protected _runtimeScriptsManager: RuntimeScriptsManager;

    constructor(args: IChromeDebugAdapterOpts, originalSession: ChromeDebugSession) {
        const session = new DelayMessagesUntilInitializedSession(originalSession);
        const chromeConnection = new (args.chromeConnection || ChromeConnection)(undefined, args.targetFilter);
        this._runtimeScriptsManager = new RuntimeScriptsManager();
        const sourceMapTransformer = new (args.sourceMapTransformer || EagerSourceMapTransformer)(this._sourceHandles, args.enableSourceMapCaching);
        const pathTransformer = new (args.pathTransformer || RemotePathTransformer)();
        const chromeDiagnostics = new ChromeDiagnostics(() => chromeConnection.api, this._runtimeScriptsManager, pathTransformer, sourceMapTransformer);
        this._sourcesManager = new SourcesManager(chromeDiagnostics);

        this._lineColTransformer = new (args.lineColTransformer || LineColTransformer)(session);

        this._chromeDebugAdapter = new ChromeDebugLogic(this._lineColTransformer, sourceMapTransformer, pathTransformer, session,
            this._runtimeScriptsManager, this._sourcesManager, chromeConnection, chromeDiagnostics);
    }

    public get events(): StepProgressEventsEmitter {
        return this._chromeDebugAdapter.events;
    }

    public get chrome(): ChromeDiagnostics {
        return this._chromeDebugAdapter.chrome;
    }

    public shutdown(): void {
        return this._chromeDebugAdapter.shutdown();
    }
    public initialize(args: DebugProtocol.InitializeRequestArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): DebugProtocol.Capabilities {
        return this._chromeDebugAdapter.initialize(args);
    }
    public launch(args: ILaunchRequestArgs, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): Promise<void> {
        return this._chromeDebugAdapter.launch(args);
    }
    public attach(args: IAttachRequestArgs, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): Promise<void> {
        return this._chromeDebugAdapter.attach(args);
    }
    public disconnect(args: DebugProtocol.DisconnectArguments): PromiseOrNot<void> {
        return this._chromeDebugAdapter.disconnect(args);
    }

    public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): PromiseOrNot<ISetBreakpointsResponseBody> {
        this.reportBpTelemetry(args);
        let parsedArgs: internal.INewSetBreakpointsArgs = {
            breakpoints: args.breakpoints,
            source: this.parseSource(args.source),
            sourceModified: args.sourceModified
        };

        parsedArgs = this._lineColTransformer.setBreakpoints(parsedArgs);
        return this._chromeDebugAdapter.setBreakpoints(parsedArgs, telemetryPropertyCollector, requestSeq);
    }

    private reportBpTelemetry(args: ISetBreakpointsArgs): void {
        let fileExt = '';
        if (args.source.path) {
            fileExt = path.extname(args.source.path);
        }

        /* __GDPR__
           "setBreakpointsRequest" : {
              "fileExt" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
              "${include}": [ "${DebugCommonProperties}" ]
           }
         */
        telemetry.reportEvent('setBreakpointsRequest', { fileExt });
    }

    public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): PromiseOrNot<void> {
        return this._chromeDebugAdapter.setExceptionBreakpoints(args);
    }
    public configurationDone(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.configurationDone();
    }
    public continue(internal?: boolean): PromiseOrNot<void> {
        return this._chromeDebugAdapter.continue(internal);
    }
    public next(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.next();
    }
    public stepIn(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.stepIn();
    }
    public stepOut(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.stepOut();
    }
    public pause(): PromiseOrNot<void> {
        return this._chromeDebugAdapter.pause();
    }
    public stackTrace(args: DebugProtocol.StackTraceArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): PromiseOrNot<IStackTraceResponseBody> {
        return this._chromeDebugAdapter.stackTrace(args);
    }
    public scopes(args: DebugProtocol.ScopesArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): PromiseOrNot<IScopesResponseBody> {
        return this._chromeDebugAdapter.scopes(args);
    }
    public variables(args: DebugProtocol.VariablesArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): PromiseOrNot<IVariablesResponseBody> {
        return this._chromeDebugAdapter.variables(args);
    }

    protected parseSource(protocolSource: DebugProtocol.Source): ISourceIdentifier {
        const hasSourcePath = !!protocolSource.path;
        const hasSourceReference = !!protocolSource.sourceReference;

        if (hasSourcePath && !hasSourceReference) {
            let realPath = this.displayPathToRealPath(protocolSource.path);

            // Request url has chars unescaped, but they will be escaped in scriptsByUrl
            return this._chromeDebugAdapter.getSourceByUrl(parseResourceLocationOrName(realPath));
        } else if (!hasSourcePath && hasSourceReference) {
            const source = this._sourceHandles.get(protocolSource.sourceReference);

            if (!source) {
                throw errors.sourceRequestIllegalHandle();
            }

            return source;
        } else {
            throw new Error(`Expected the source to have a path (${protocolSource.path}) either or a source reference (${protocolSource.sourceReference})`);
        }
    }

    public async source(args: DebugProtocol.SourceArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): Promise<ISourceResponseBody> {
        const source = this.parseSource(args.source);
        const sourceText = await this._sourcesManager.text(source);
        return {
            content: sourceText,
            mimeType: 'text/javascript'
        };
    }
    public threads(): PromiseOrNot<IThreadsResponseBody> {
        return this._chromeDebugAdapter.threads();
    }
    public evaluate(args: DebugProtocol.EvaluateArguments, telemetryPropertyCollector?: ITelemetryPropertyCollector, requestSeq?: number): PromiseOrNot<IEvaluateResponseBody> {
        return this._chromeDebugAdapter.evaluate(args);
    }

    /**
     * Called when returning a stack trace, for the path for Sources that have a sourceReference, so consumers can
     * tweak it, since it's only for display.
     */
    protected realPathToDisplayPath(realPath: string): string {
        if (ChromeUtils.isEvalScript(realPath)) {
            return `${ChromeDebugLogic.EVAL_ROOT}/${realPath}`;
        }

        return realPath;
    }

    protected displayPathToRealPath(displayPath: string): string {
        if (displayPath.startsWith(ChromeDebugLogic.EVAL_ROOT)) {
            return displayPath.substr(ChromeDebugLogic.EVAL_ROOT.length + 1); // Trim "<eval>/"
        }

        return displayPath;
    }
}