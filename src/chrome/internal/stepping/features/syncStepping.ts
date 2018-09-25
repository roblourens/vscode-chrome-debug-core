import { ICallFrame } from '../../stackTraces/callFrame';

import { IScript } from '../../scripts/script';
import { ShouldPauseForUserListener, ShouldPauseForUser } from '../../features/pauseProgramWhenNeeded';
import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';

type SteppingAction = () => Promise<void>;

interface SyncSteppingStatus {
    startStepping(): SyncSteppingStatus;
}

class CurrentlyStepping implements SyncSteppingStatus {
    startStepping(): SyncSteppingStatus {
        throw new Error('Cannot start stepping again while the program is already stepping');
    }

}

class CurrentlyIdle implements SyncSteppingStatus {
    startStepping(): SyncSteppingStatus {
        return new CurrentlyStepping();
    }
}

export interface SyncSteppingDependencies {
    stepOverInProgram(): Promise<void>;
    stepIntoInProgram(params: { breakOnAsyncCall: boolean }): Promise<void>;
    stepOutInProgram(): Promise<void>;
    resumeProgram(): Promise<void>;
    pauseProgram(): Promise<void>;
    restartFrameInProgram(callFrame: ICallFrame<IScript>): Promise<void>;
    onShouldPauseForUser(listener: ShouldPauseForUserListener): void;
}

export class SyncStepping implements IFeature {
    private _status: SyncSteppingStatus = new CurrentlyIdle();

    public stepOver = this.createSteppingMethod(() => this._dependencies.stepOverInProgram());
    public stepInto = this.createSteppingMethod(() => this._dependencies.stepIntoInProgram({ breakOnAsyncCall: true }));
    public stepOut = this.createSteppingMethod(() => this._dependencies.stepOutInProgram());

    public continue(): Promise<void> {
        return this._dependencies.resumeProgram();
    }

    public pause(): Promise<void> {
        return this._dependencies.pauseProgram();
    }

    private onShouldPauseForUser(_paused: PausedEvent): ShouldPauseForUser {
        return ShouldPauseForUser.Abstained;
    }

    public async restartFrame(callFrame: ICallFrame<IScript>): Promise<void> {
        this._status = this._status.startStepping();
        await this._dependencies.restartFrameInProgram(callFrame);
        await this._dependencies.stepIntoInProgram({ breakOnAsyncCall: true });
    }

    private createSteppingMethod(steppingAction: SteppingAction): (() => Promise<void>) {
        return () => {
            this._status = this._status.startStepping();
            return steppingAction();
        };
    }

    public install(): void {
        this._dependencies.onShouldPauseForUser(paused => this.onShouldPauseForUser(paused));
    }

    constructor(private readonly _dependencies: SyncSteppingDependencies) { }
}