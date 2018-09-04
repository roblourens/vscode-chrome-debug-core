import { ICallFrame } from '../../stackTraces/callFrame';

import { IScript } from '../../scripts/script';
import { InformationAboutPausedProvider, PossibleAction, NoInformation } from '../../features/takeProperActionOnPausedEvent';
import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';

type SteppingAction = () => Promise<void>;

interface SyncSteppingStatus {
    startStepping(): SyncSteppingStatus;
}

class CurrentlyStepping implements SyncSteppingStatus {
    public startStepping(): SyncSteppingStatus {
        throw new Error('Cannot start stepping again while the program is already stepping');
    }

}

class CurrentlyIdle implements SyncSteppingStatus {
    public startStepping(): SyncSteppingStatus {
        return new CurrentlyStepping();
    }
}

export interface SyncSteppingDependencies {
    stepOverDebugee(): Promise<void>;
    stepIntoDebugee(params: { breakOnAsyncCall: boolean }): Promise<void>;
    stepOutInDebugee(): Promise<void>;
    resumeDebugee(): Promise<void>;
    pauseDebugee(): Promise<void>;
    restartFrameInDebugee(callFrame: ICallFrame<IScript>): Promise<void>;
    askForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
}

export class SyncStepping implements IFeature {
    private _status: SyncSteppingStatus = new CurrentlyIdle();

    public stepOver = this.createSteppingMethod(() => this._dependencies.stepOverDebugee());
    public stepInto = this.createSteppingMethod(() => this._dependencies.stepIntoDebugee({ breakOnAsyncCall: true }));
    public stepOut = this.createSteppingMethod(() => this._dependencies.stepOutInDebugee());

    public continue(): Promise<void> {
        return this._dependencies.resumeDebugee();
    }

    public pause(): Promise<void> {
        return this._dependencies.pauseDebugee();
    }

    private askForInformationAboutPaused(_paused: PausedEvent): PossibleAction {
        return new NoInformation();
    }

    public async restartFrame(callFrame: ICallFrame<IScript>): Promise<void> {
        this._status = this._status.startStepping();
        await this._dependencies.restartFrameInDebugee(callFrame);
        await this._dependencies.stepIntoDebugee({ breakOnAsyncCall: true });
    }

    private createSteppingMethod(steppingAction: SteppingAction): (() => Promise<void>) {
        return async () => {
            this._status = this._status.startStepping();
            await steppingAction();
            this._status = new CurrentlyIdle();
        };
    }

    public install(): void {
        this._dependencies.askForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
    }

    constructor(private readonly _dependencies: SyncSteppingDependencies) { }
}