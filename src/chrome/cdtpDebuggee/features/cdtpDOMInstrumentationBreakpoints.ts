import { Protocol as CDTP } from 'devtools-protocol';

import { injectable, inject } from 'inversify';
import { TYPES } from '../../dependencyInjection.ts/types';

export interface IDOMInstrumentationBreakpoints {
    setInstrumentationBreakpoint(params: CDTP.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void>;
    removeInstrumentationBreakpoint(params: CDTP.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void>;
}

@injectable()
export class CDTPDOMDebugger implements IDOMInstrumentationBreakpoints {
    protected api = this._protocolApi.DOMDebugger;

    constructor(
        @inject(TYPES.CDTPClient)
        protected _protocolApi: CDTP.ProtocolApi) { }

    public setInstrumentationBreakpoint(params: CDTP.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
        return this.api.setInstrumentationBreakpoint(params);
    }

    public removeInstrumentationBreakpoint(params: CDTP.DOMDebugger.SetInstrumentationBreakpointRequest): Promise<void> {
        return this.api.removeInstrumentationBreakpoint(params);
    }
}
