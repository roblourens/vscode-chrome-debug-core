import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';
import { PossibleAction, InformationAboutPausedProvider, ActionRelevance, NoInformation, ResumeCommonLogic, ResumeDependencies } from '../../features/takeProperActionOnPausedEvent';
import { Crdp } from '../../../..';

export interface AsyncSteppingDependencies extends ResumeDependencies {
    askForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    pauseProgramOnAsyncCall(parentStackTraceId: Crdp.Runtime.StackTraceId): Promise<void>;
}

export class PausedBecauseAsyncCallWasScheduled extends ResumeCommonLogic {
    public readonly relevance = ActionRelevance.FallbackAction;

    constructor(protected _dependencies: ResumeDependencies) {
        super();
    }
}

export class AsyncStepping implements IFeature {
    public async askForInformationAboutPaused(notification: PausedEvent): Promise<PossibleAction> {
        if (notification.asyncCallStackTraceId) {
            await this._dependencies.pauseProgramOnAsyncCall(notification.asyncCallStackTraceId);
            return new PausedBecauseAsyncCallWasScheduled(this._dependencies);
        }

        return new NoInformation();
    }

    public install(): void {
        this._dependencies.askForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
    }

    constructor(private readonly _dependencies: AsyncSteppingDependencies) { }
}