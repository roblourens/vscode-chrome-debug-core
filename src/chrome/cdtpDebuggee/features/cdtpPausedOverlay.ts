import { CDTPEnableableDiagnosticsModule } from '../infrastructure/cdtpDiagnosticsModule';
import { Protocol as CDTP } from 'devtools-protocol';
import { TYPES } from '../../dependencyInjection.ts/types';
import { inject } from 'inversify';
import { CDTPDomainsEnabler } from '../infrastructure/cdtpDomainsEnabler';

export interface IPausedOverlay {
    setPausedInDebuggerMessage(params: CDTP.Overlay.SetPausedInDebuggerMessageRequest): Promise<void>;
}

// TODO: Move this to a browser shared package
export class CDTPOverlay extends CDTPEnableableDiagnosticsModule<CDTP.OverlayApi> implements IPausedOverlay {
    protected readonly api = this._protocolApi.Overlay;

    constructor(
        @inject(TYPES.CDTPClient) private readonly _protocolApi: CDTP.ProtocolApi,
        @inject(TYPES.IDomainsEnabler) domainsEnabler: CDTPDomainsEnabler, ) {
        super(domainsEnabler);
    }

    public setPausedInDebuggerMessage(params: CDTP.Overlay.SetPausedInDebuggerMessageRequest): Promise<void> {
        return this.api.setPausedInDebuggerMessage(params);
    }
}
