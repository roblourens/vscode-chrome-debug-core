import { CDTPEventsEmitterDiagnosticsModule } from '../infrastructure/cdtpDiagnosticsModule';
import { Protocol as CDTP } from 'devtools-protocol';

import { CDTPStackTraceParser } from '../protocolParsers/cdtpStackTraceParser';
import { integer } from '../cdtpPrimitives';
import { CodeFlowStackTrace } from '../../internal/stackTraces/stackTrace';
import { IScript } from '../../internal/scripts/script';
import { TYPES } from '../../dependencyInjection.ts/types';
import { inject } from 'inversify';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { CDTPDomainsEnabler } from '../infrastructure/cdtpDomainsEnabler';

export type LogEntrySource = 'xml' | 'javascript' | 'network' | 'storage' | 'appcache' | 'rendering' | 'security' | 'deprecation' | 'worker' | 'violation' | 'intervention' | 'recommendation' | 'other';
export type LogLevel = 'verbose' | 'info' | 'warning' | 'error';

export interface LogEntry {
    readonly source: LogEntrySource;
    readonly level: LogLevel;
    readonly text: string;
    readonly timestamp: CDTP.Runtime.Timestamp;
    readonly url?: string;
    readonly lineNumber?: integer;
    readonly stackTrace?: CodeFlowStackTrace<IScript>;
    readonly networkRequestId?: CDTP.Network.RequestId;
    readonly workerId?: string;
    readonly args?: CDTP.Runtime.RemoteObject[];
}

export interface ILogEventsProvider {
    onEntryAdded(listener: (entry: LogEntry) => void): void;
}

export class CDTPLogEventsProvider extends CDTPEventsEmitterDiagnosticsModule<CDTP.LogApi> implements ILogEventsProvider {
    protected readonly api = this._protocolApi.Log;

    private readonly _stackTraceParser = new CDTPStackTraceParser(this._scriptsRegistry);

    public readonly onEntryAdded = this.addApiListener('entryAdded', async (params: CDTP.Log.EntryAddedEvent) => await this.toLogEntry(params.entry));

    constructor(
        @inject(TYPES.CDTPClient) private readonly _protocolApi: CDTP.ProtocolApi,
        @inject(TYPES.CDTPScriptsRegistry) private _scriptsRegistry: CDTPScriptsRegistry,
        @inject(TYPES.IDomainsEnabler) domainsEnabler: CDTPDomainsEnabler,
    ) {
        super(domainsEnabler);
    }

    private async toLogEntry(entry: CDTP.Log.LogEntry): Promise<LogEntry> {
        return {
            source: entry.source,
            level: entry.level,
            text: entry.text,
            timestamp: entry.timestamp,
            url: entry.url,
            lineNumber: entry.lineNumber,
            networkRequestId: entry.networkRequestId,
            workerId: entry.workerId,
            args: entry.args,
            stackTrace: entry.stackTrace && await this._stackTraceParser.toStackTraceCodeFlow(entry.stackTrace),
        };
    }
}
