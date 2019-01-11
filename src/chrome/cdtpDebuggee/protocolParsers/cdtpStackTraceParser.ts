import { Protocol as CDTP } from 'devtools-protocol';

import { IScript, } from '../../internal/scripts/script';
import { CodeFlowStackTrace } from '../../internal/stackTraces/stackTrace';
import { CodeFlowFrame } from '../../internal/stackTraces/callFrame';
import { createCallFrameName } from '../../internal/stackTraces/callFrameName';
import { CDTPLocationParser, HasScriptLocation } from './cdtpLocationParser';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { asyncMap } from '../../collections/async';

export class CDTPStackTraceParser {
    private readonly _cdtpLocationParser = new CDTPLocationParser(this._scriptsRegistry);

    public async toStackTraceCodeFlow(stackTrace: CDTP.Runtime.StackTrace): Promise<CodeFlowStackTrace<IScript>> {
        return {
            codeFlowFrames: await asyncMap(stackTrace.callFrames, (callFrame, index) => this.runtimeCallFrameToCodeFlowFrame(index, callFrame)),
            description: stackTrace.description,
            parent: stackTrace.parent && await this.toStackTraceCodeFlow(stackTrace.parent)
        };
    }

    private runtimeCallFrameToCodeFlowFrame(index: number, callFrame: CDTP.Runtime.CallFrame): Promise<CodeFlowFrame<IScript>> {
        return this.toCodeFlowFrame(index, callFrame, callFrame);
    }

    public async toCodeFlowFrame(index: number, callFrame: CDTP.Runtime.CallFrame | CDTP.Debugger.CallFrame, location: HasScriptLocation): Promise<CodeFlowFrame<IScript>> {
        const scriptLocation = await this._cdtpLocationParser.getLocationInScript(location);
        const name = createCallFrameName(scriptLocation.script, callFrame.functionName);
        return new CodeFlowFrame(index, name, scriptLocation);
    }

    constructor(private _scriptsRegistry: CDTPScriptsRegistry) { }
}
