import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';
import { ShouldPauseForUser, ShouldPauseForUserListener } from '../../features/pauseProgramWhenNeeded';
import { Crdp } from '../../../..';

export interface AsyncSteppingDependencies {
    onShouldPauseForUser(listener: ShouldPauseForUserListener): void;
    pauseProgramOnAsyncCall(parentStackTraceId: Crdp.Runtime.StackTraceId): Promise<void>;
}

export class AsyncStepping implements IFeature {
    public async onShouldPauseForUser(notification: PausedEvent): Promise<ShouldPauseForUser> {
        if (notification.asyncCallStackTraceId) {
            await this._dependencies.pauseProgramOnAsyncCall(notification.asyncCallStackTraceId);
            return ShouldPauseForUser.ShouldConsiderResuming;
        }

        return ShouldPauseForUser.Abstained;
    }

    public install(): void {
        this._dependencies.onShouldPauseForUser(paused => this.onShouldPauseForUser(paused));
    }

    constructor(private readonly _dependencies: AsyncSteppingDependencies) { }
}