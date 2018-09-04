import { asyncMap } from '../../collections/async';
import { PausedEvent } from '../../target/events';
import { BreakpointsRegistry } from './breakpointsRegistry';
import { ILoadedSource } from '../sources/loadedSource';

export interface BPsWhileLoadingLogicDependencies {
    setInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    removeInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    waitUntilUnbindedBPsAreSet(loadedSource: ILoadedSource): Promise<void>;
    resumeProgram(): Promise<void>;
    notifyPausedOnBreakpoint(paused: PausedEvent): Promise<void>;
    onPausingOnScriptFirstStatement(listener: (paused: PausedEvent) => Promise<void> | void): void;
}

export class PauseScriptLoadsToSetBPs {
    private _isEnabled = false;

    private async onPausingOnScriptFirstStatement(paused: PausedEvent): Promise<void> {
        await asyncMap(paused.callFrames[0].location.script.allSources, async source => {
            await this._dependencies.waitUntilUnbindedBPsAreSet(source);
        });

        const breakpoints = this._breakpointsRegistry.tryGettingBreakpointAtLocation(paused.callFrames[0].location);
        const bpRecipies = breakpoints.map(bp => bp.recipie);
        if (breakpoints.length > 0) {
            this._dependencies.notifyPausedOnBreakpoint(paused.cloneButWithHitBreakpoints(bpRecipies));
        } else {
            this._dependencies.resumeProgram();
        }
    }

    public async enableIfNeccesary(): Promise<void> {
        if (this._isEnabled === false) {
            this.startPausingOnScriptFirstStatement();
        }
    }

    public async disableIfNeccesary(): Promise<void> {
        if (this._isEnabled === true) {
            this.stopPausingOnScriptFirstStatement();
        }
    }

    private async startPausingOnScriptFirstStatement(): Promise<void> {
        return this._dependencies.setInstrumentationBreakpoint('scriptFirstStatement');
    }

    private async stopPausingOnScriptFirstStatement(): Promise<void> {
        return this._dependencies.removeInstrumentationBreakpoint('scriptFirstStatement');
    }

    constructor(
        private readonly _dependencies: BPsWhileLoadingLogicDependencies,
        private readonly _breakpointsRegistry: BreakpointsRegistry) {
        this._dependencies.onPausingOnScriptFirstStatement(params => this.onPausingOnScriptFirstStatement(params));
    }
}