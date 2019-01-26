/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Protocol as CDTP } from 'devtools-protocol';
import { IScript } from '../../internal/scripts/script';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';
import { IPositionInScript } from '../../internal/scripts/sourcesMapper';

export interface IBlackboxPatternsConfigurer {
    setBlackboxPatterns(params: CDTP.Debugger.SetBlackboxPatternsRequest): Promise<void>;
    setBlackboxedRanges(script: IScript, positions: IPositionInScript[]): Promise<void>;
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

    public setBlackboxedRanges(script: IScript, positions: IPositionInScript[]): Promise<void> {
        const cdtpPositions: CDTP.Debugger.ScriptPosition[] = positions.map(p => ({
            lineNumber: p.line,
            columnNumber: p.column
        }));

        return this.api.setBlackboxedRanges({ scriptId: this._scriptsRegistry.getCdtpId(script), positions: cdtpPositions });
    }

    public setBlackboxPatterns(params: CDTP.Debugger.SetBlackboxPatternsRequest): Promise<void> {
        return this.api.setBlackboxPatterns(params);
    }
}
