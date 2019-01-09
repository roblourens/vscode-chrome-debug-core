import { Protocol as CDTP } from 'devtools-protocol';

import { injectable, inject } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';
import { Version } from '../../utils/Version';

export interface IDebugeeRuntimeVersionProvider {
    version(): Promise<Version>;
}

/// TODO: Move this to a browser-shared package
/// TODO: Update this so we automatically try to use ChromeConnection.version first, and then fallback to this if neccesary
@injectable()
export class CDTPDebugeeRuntimeVersionProvider implements IDebugeeRuntimeVersionProvider {
    protected api = this._protocolApi.Browser;

    constructor(
        @inject(TYPES.CDTPClient)
        protected _protocolApi: CDTP.ProtocolApi) {
    }

    public async version(): Promise<Version> {
        // const version = productVersionText.replace(/Chrome\/([0-9]{2})\..*/, '$1');
        return Version.coerce((await this.api.getVersion()).product);
    }
}
