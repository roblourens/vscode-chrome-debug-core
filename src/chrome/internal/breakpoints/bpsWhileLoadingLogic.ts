import { IBreakpoint } from './breakpoint';
import { IScript } from '../scripts/script';
import { asyncMap } from '../../collections/async';
import { ILoadedSource } from '../scripts/loadedSource';

export interface BPsWhileLoadingLogicDependencies {
    setInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    removeInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    waitUntilUnbindedBPsAreSet(loadedSource: ILoadedSource): Promise<void>;
}

export class BPsWhileLoadingLogic {
    private _isEnabled = false;

    public async onPausingOnScriptFirstStatement(breakpoint: IBreakpoint<IScript>): Promise<void> {
        await asyncMap(breakpoint.actualLocation.script.allSources, source => {
            this._dependencies.waitUntilUnbindedBPsAreSet(source);
        });
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
        private readonly _dependencies: BPsWhileLoadingLogicDependencies) {
    }
}