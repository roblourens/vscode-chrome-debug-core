import { Protocol as CDTP } from 'devtools-protocol';
import { IScript } from '../../internal/scripts/script';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';

export interface IBlackboxPatternsConfigurer {
    setBlackboxPatterns(params: CDTP.Debugger.SetBlackboxPatternsRequest): Promise<void>;
    setBlackboxedRanges(script: IScript, positions: CDTP.Debugger.ScriptPosition[]): Promise<void>;
}

@injectable()
export class CDTPBlackboxPatternsConfigurer implements IBlackboxPatternsConfigurer {
    protected readonly api = this._protocolApi.Debugger;

    constructor(
        @inject(TYPES.CDTPClient)
        private readonly _protocolApi: CDTP.ProtocolApi,
        @inject(TYPES.CDTPScriptsRegistry)
        private readonly _scriptsRegistry: CDTPScriptsRegistry) {
    }

    public setBlackboxedRanges(script: IScript, positions: CDTP.Debugger.ScriptPosition[]): Promise<void> {
        return this.api.setBlackboxedRanges({ scriptId: this._scriptsRegistry.getCdtpId(script), positions: positions });
    }

    public setBlackboxPatterns(params: CDTP.Debugger.SetBlackboxPatternsRequest): Promise<void> {
        return this.api.setBlackboxPatterns(params);
    }
}
