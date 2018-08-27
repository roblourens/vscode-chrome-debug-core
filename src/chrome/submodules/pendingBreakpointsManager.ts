import { utils, ChromeDebugSession } from '../..';
import * as path from 'path';
import { IPendingBreakpoint, ChromeDebugLogic } from '../chromeDebugAdapter';
import { BreakpointEvent, logger } from 'vscode-debugadapter';

export class PendingBreakpointsManager {
    private _pendingBreakpointsByUrl: Map<string, IPendingBreakpoint>;

    constructor(private _chromeDebugAdapter: ChromeDebugLogic, private _session: ChromeDebugSession) {

    }

    public async resolvePendingBPs(source: string): Promise<void> {
        source = source && utils.canonicalizeUrl(source);
        const pendingBP = this._pendingBreakpointsByUrl.get(source);
        if (pendingBP && (!pendingBP.setWithPath || utils.canonicalizeUrl(pendingBP.setWithPath) === source)) {
            logger.log(`OnScriptParsed.resolvePendingBPs: Resolving pending breakpoints: ${JSON.stringify(pendingBP)}`);
            await this.resolvePendingBreakpoint(pendingBP);
            this._pendingBreakpointsByUrl.delete(source);
        } else if (source) {
            const sourceFileName = path.basename(source).toLowerCase();
            if (Array.from(this._pendingBreakpointsByUrl.keys()).find(key => key.toLowerCase().indexOf(sourceFileName) > -1)) {
                logger.log(`OnScriptParsed.resolvePendingBPs: The following pending breakpoints won't be resolved: ${JSON.stringify(pendingBP)} pendingBreakpointsByUrl = ${JSON.stringify([...this._pendingBreakpointsByUrl])} source = ${source}`);
            }
        }
    }

    private resolvePendingBreakpoint(pendingBP: IPendingBreakpoint): Promise<void> {
        return this._chromeDebugAdapter.setBreakpoints(pendingBP.args, null, pendingBP.requestSeq, pendingBP.ids).then(response => {
            response.breakpoints.forEach((bp, i) => {
                bp.id = pendingBP.ids[i];
                this._session.sendEvent(new BreakpointEvent('changed', bp));
            });
        });
    }

    public addUnresolvedBreakpoints(script: string, breakpoints: IPendingBreakpoint) {
        this._pendingBreakpointsByUrl.set(
            script,
            breakpoints);
    }
}