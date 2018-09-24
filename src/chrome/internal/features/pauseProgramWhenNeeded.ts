import _ = require('lodash');

import { IFeature } from './feature';
import { PausedEvent } from '../../target/events';

export enum ShouldPauseForUser {
    NeedsToPause, // The listener has information that indicates that it's neccesary to pause for this event
    Abstained, // The listener doesn't have any information on whether we should pause or not
    ShouldConsiderResuming, // The listener has information that indicates that in the absence of better information, we should resume for this event
}

export type ShouldPauseForUserListener = (paused: PausedEvent) => (Promise<ShouldPauseForUser> | ShouldPauseForUser);

export interface PauseProgramWhenNeededDependencies {
    onPause(listener: (paused: PausedEvent) => Promise<void> | void): void;
    notifyOfShouldPauseForUser(paused: PausedEvent): Promise<ShouldPauseForUser>;
    resumeProgram(): void;
}

export class PauseProgramWhenNeeded implements IFeature {
    public install(): void {
        this._dependencies.onPause(this.onPause);
        throw new Error('Method not implemented.');
    }

    public async onPause(paused: PausedEvent): Promise<void> {
        const responses = this._dependencies.notifyOfShouldPauseForUser(paused);
        const responsesTally = _.countBy(responses);
        if (responsesTally[ShouldPauseForUser.NeedsToPause] === 0) {
            await this._dependencies.resumeProgram();
        }
    }

    constructor(private readonly _dependencies: PauseProgramWhenNeededDependencies) { }
}
