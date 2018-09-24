import { asyncMap } from '../../../collections/async';
import { PausedEvent } from '../../../target/events';
import { ILoadedSource } from '../../sources/loadedSource';
import { IFeature } from '../../features/feature';
import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../../locations/location';
import { IBreakpoint } from '../breakpoint';
import { ShouldPauseForUser } from '../../features/pauseProgramWhenNeeded';

export interface PauseScriptLoadsToSetBPsDependencies {
    setInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    removeInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    onShouldPauseForUser(listener: (paused: PausedEvent) => Promise<ShouldPauseForUser> | ShouldPauseForUser): void;
    waitUntilUnbindedBPsAreSet(loadedSource: ILoadedSource): Promise<void>;

    tryGettingBreakpointAtLocation(locationInScript: LocationInScript): IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[];
}

export class PauseScriptLoadsToSetBPs implements IFeature {
    private readonly stopsWhileScriptsLoadInstrumentationName = 'scriptFirstStatement';
    private _isInstrumentationEnabled = false;

    public async enableIfNeccesary(): Promise<void> {
        if (this._isInstrumentationEnabled === false) {
            await this.startPausingOnScriptFirstStatement();
        }
    }

    public async disableIfNeccesary(): Promise<void> {
        if (this._isInstrumentationEnabled === true) {
            await this.stopPausingOnScriptFirstStatement();
        }
    }

    public install(): void {
        this._dependencies.onShouldPauseForUser(params => this.onShouldPauseForUser(params));
    }

    private async onShouldPauseForUser(paused: PausedEvent): Promise<ShouldPauseForUser> {
        if (this.isInstrumentationPause(paused)) {
            await asyncMap(paused.callFrames[0].location.script.allSources, async source => {
                await this._dependencies.waitUntilUnbindedBPsAreSet(source);
            });

            const breakpoints = this._dependencies.tryGettingBreakpointAtLocation(paused.callFrames[0].location);
            if (breakpoints.length > 0) {
                return ShouldPauseForUser.NeedsToPause;
            } else {
                return ShouldPauseForUser.ShouldConsiderResuming;
            }
        } else {
            return ShouldPauseForUser.Abstained;
        }
    }

    private async startPausingOnScriptFirstStatement(): Promise<void> {
        return this._dependencies.setInstrumentationBreakpoint(this.stopsWhileScriptsLoadInstrumentationName);
    }

    private async stopPausingOnScriptFirstStatement(): Promise<void> {
        return this._dependencies.removeInstrumentationBreakpoint(this.stopsWhileScriptsLoadInstrumentationName);
    }

    private isInstrumentationPause(notification: PausedEvent): boolean {
        return (notification.reason === 'EventListener' && notification.data.eventName.startsWith('instrumentation:')) ||
            (notification.reason === 'ambiguous' && Array.isArray(notification.data.reasons) &&
                notification.data.reasons.every((r: any) => r.reason === 'EventListener' && r.auxData.eventName.startsWith('instrumentation:')));
    }

    constructor(
        private readonly _dependencies: PauseScriptLoadsToSetBPsDependencies) {
    }
}