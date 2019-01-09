import { CDTP, parseResourceIdentifier, BasePathTransformer, BaseSourceMapTransformer } from '../../..';
import { CDTPEventsEmitterDiagnosticsModule } from '../infrastructure/cdtpDiagnosticsModule';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { IScript, Script } from '../../internal/scripts/script';
import { createCDTPScriptUrl } from '../../internal/sources/resourceIdentifierSubtypes';
import { SourcesMapper, NoSourceMapping as NoSourcesMapper } from '../../internal/scripts/sourcesMapper';
import { ResourceName } from '../../internal/sources/resourceIdentifier';
import { TYPES } from '../../dependencyInjection.ts/types';
import { CDTPStackTraceParser } from '../protocolParsers/cdtpStackTraceParser';
import { inject } from 'inversify';
import { integer } from '../cdtpPrimitives';
import { CodeFlowStackTrace } from '../../internal/stackTraces/stackTrace';
import { IExecutionContext } from '../../internal/scripts/executionContext';
import { CDTPDomainsEnabler } from '../infrastructure/cdtpDomainsEnabler';

/**
 * A new JavaScript Script has been parsed by the debugee and it's about to be executed
 */
export interface ScriptParsedEvent {
    readonly script: IScript;
    readonly url: string;
    readonly startLine: integer;
    readonly startColumn: integer;
    readonly endLine: integer;
    readonly endColumn: integer;
    readonly executionContext: IExecutionContext;
    readonly hash: string;
    readonly executionContextAuxData?: any;
    readonly isLiveEdit?: boolean;
    readonly sourceMapURL?: string;
    readonly hasSourceURL?: boolean;
    readonly isModule?: boolean;
    readonly length?: integer;
    readonly stackTrace?: CodeFlowStackTrace<IScript>;
}

export type ScriptParsedListener = (params: ScriptParsedEvent) => void;

export interface IScriptParsedProvider {
    onScriptParsed(listener: (event: ScriptParsedEvent) => void): void;
}

export class CDTPOnScriptParsedEventProvider extends CDTPEventsEmitterDiagnosticsModule<CDTP.DebuggerApi, void, CDTP.Debugger.EnableResponse> implements IScriptParsedProvider {
    protected readonly api = this._protocolApi.Debugger;

    private readonly _stackTraceParser = new CDTPStackTraceParser(this._scriptsRegistry);

    public onScriptParsed = this.addApiListener('scriptParsed', async (params: CDTP.Debugger.ScriptParsedEvent) => {
        await this.createAndRegisterScript(params);

        return await this.toScriptParsedEvent(params);
    });

    constructor(
        @inject(TYPES.CDTPClient) private readonly _protocolApi: CDTP.ProtocolApi,
        @inject(TYPES.BasePathTransformer) private readonly _pathTransformer: BasePathTransformer,
        @inject(TYPES.BaseSourceMapTransformer) private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        @inject(TYPES.CDTPScriptsRegistry) private readonly _scriptsRegistry: CDTPScriptsRegistry,
        @inject(TYPES.IDomainsEnabler) domainsEnabler: CDTPDomainsEnabler,
        ) {
        super(domainsEnabler);
    }

    private async createAndRegisterScript(params: CDTP.Debugger.ScriptParsedEvent): Promise<IScript> {
        // The stack trace and hash can be large and the DA doesn't need it.
        delete params.stackTrace;
        delete params.hash;

        const executionContext = this._scriptsRegistry.getExecutionContextById(params.executionContextId);

        const script = await this._scriptsRegistry.registerScript(params.scriptId, async () => {
            if (params.url !== undefined && params.url !== '') {
                const runtimeSourceLocation = parseResourceIdentifier(createCDTPScriptUrl(params.url));
                const developmentSourceLocation = await this._pathTransformer.scriptParsed(runtimeSourceLocation);
                const sourceMap = await this._sourceMapTransformer.scriptParsed(runtimeSourceLocation.canonicalized, params.sourceMapURL);
                const sourceMapper = sourceMap
                    ? new SourcesMapper(sourceMap)
                    : new NoSourcesMapper();

                const runtimeScript = Script.create(executionContext, runtimeSourceLocation, developmentSourceLocation, sourceMapper);
                return runtimeScript;
            } else {
                const sourceMap = await this._sourceMapTransformer.scriptParsed('', params.sourceMapURL);
                const sourceMapper = sourceMap
                    ? new SourcesMapper(sourceMap)
                    : new NoSourcesMapper();
                const runtimeScript = Script.createEval(executionContext, new ResourceName(createCDTPScriptUrl(params.scriptId)), sourceMapper);
                return runtimeScript;
            }
        });

        return script;
    }

    private async toScriptParsedEvent(params: CDTP.Debugger.ScriptParsedEvent): Promise<ScriptParsedEvent> {
        const executionContext = this._scriptsRegistry.getExecutionContextById(params.executionContextId);

        return {
            url: params.url,
            startLine: params.startLine,
            startColumn: params.startColumn,
            endLine: params.endLine,
            endColumn: params.endColumn,
            executionContext: executionContext,
            hash: params.hash,
            executionContextAuxData: params.executionContextAuxData,
            isLiveEdit: params.isLiveEdit,
            sourceMapURL: params.sourceMapURL,
            hasSourceURL: params.hasSourceURL,
            isModule: params.isModule,
            length: params.length,
            script: await this._scriptsRegistry.getScriptByCdtpId(params.scriptId),
            stackTrace: params.stackTrace && await this._stackTraceParser.toStackTraceCodeFlow(params.stackTrace)
        };
    }
}