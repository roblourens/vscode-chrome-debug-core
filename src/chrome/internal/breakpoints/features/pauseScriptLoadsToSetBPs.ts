import { asyncMap } from '../../../collections/async';
import { PausedEvent } from '../../../target/events';
import { ILoadedSource } from '../../sources/loadedSource';
import { IFeature } from '../../features/feature';
import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../../locations/location';
import { IBreakpoint } from '../breakpoint';
import { PossibleAction, ActionRelevance, NoInformation, NotifyStoppedCommonLogic, NotifyStoppedDependencies, ResumeCommonLogic, ResumeDependencies } from '../../features/takeProperActionOnPausedEvent';
import { ReasonType } from '../../../stoppedEvent';

export interface PauseScriptLoadsToSetBPsDependencies extends NotifyStoppedDependencies, ResumeDependencies {
    setInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    removeInstrumentationBreakpoint(nativeEventName: string): Promise<void>;
    askForInformationAboutPaused(listener: (paused: PausedEvent) => Promise<PossibleAction> | PossibleAction): void;
    waitUntilUnbindedBPsAreSet(loadedSource: ILoadedSource): Promise<void>;

    tryGettingBreakpointAtLocation(locationInScript: LocationInScript): IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[];
}

export class HitStillPendingBreakpoint extends NotifyStoppedCommonLogic {
    public readonly relevance = ActionRelevance.NormalAction;
    protected reason: ReasonType = 'breakpoint';

    constructor(protected readonly _dependencies: NotifyStoppedDependencies) {
        super();
    }
}

export class PausedWhileLoadingScriptToResolveBreakpoints extends ResumeCommonLogic {
    public readonly relevance = ActionRelevance.FallbackAction;

    constructor(protected readonly _dependencies: ResumeDependencies) {
        super();
    }
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
        this._dependencies.askForInformationAboutPaused(params => this.askForInformationAboutPaused(params));
    }

    private async askForInformationAboutPaused(paused: PausedEvent): Promise<PossibleAction> {
        if (this.isInstrumentationPause(paused)) {
            await asyncMap(paused.callFrames[0].location.script.allSources, async source => {
                await this._dependencies.waitUntilUnbindedBPsAreSet(source);
            });

            const breakpoints = this._dependencies.tryGettingBreakpointAtLocation(paused.callFrames[0].location);
            if (breakpoints.length > 0) {
                return new HitStillPendingBreakpoint(this._dependencies);
            } else {
                return new PausedWhileLoadingScriptToResolveBreakpoints(this._dependencies);
            }
        } else {
            return new NoInformation();
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