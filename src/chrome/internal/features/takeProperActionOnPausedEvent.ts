import { IComponent } from './feature';
import { PausedEvent } from '../../target/events';
import { DebugeeIsStoppedParameters } from '../../client/eventSender';
import { ReasonType } from '../../stoppedEvent';
import { PromiseOrNot } from '../../utils/promises';
import { Vote, VoteCommonLogic, VoteRelevance, ExecuteDecisionBasedOnVotes } from '../../communication/collaborativeDecision';
import { injectable } from 'inversify';

export interface NotifyStoppedDependencies {
    notifyClientDebugeeIsStopped(params: DebugeeIsStoppedParameters): void;
}

export interface ResumeDependencies {
    resumeProgram(): void;
}

export abstract class ResumeCommonLogic extends VoteCommonLogic<void> {
    protected readonly abstract _dependencies: ResumeDependencies;

    public async execute(): Promise<void> {
        this._dependencies.resumeProgram();
    }
}

export abstract class NotifyStoppedCommonLogic extends VoteCommonLogic<void> {
    protected readonly exception: any;
    protected readonly abstract reason: ReasonType;
    protected readonly abstract _dependencies: NotifyStoppedDependencies;

    public async execute(): Promise<void> {
        this._dependencies.notifyClientDebugeeIsStopped({ reason: this.reason, exception: this.exception });
    }
}

export type InformationAboutPausedProvider = (paused: PausedEvent) => Promise<Vote<void>>;

export interface TakeProperActionOnPausedEventDependencies extends TakeActionBasedOnInformationDependencies {
    onPaused(listener: (paused: PausedEvent) => Promise<void> | void): void;
}

@injectable()
export class TakeProperActionOnPausedEvent implements IComponent {
    public async onPause(paused: PausedEvent): Promise<void> {
        // Ask all the listeners what information they can provide
        const infoPieces = await this._dependencies.askForInformationAboutPause(paused);

        // Remove pieces without any relevant information
        const relevantInfoPieces = infoPieces.filter(response => response.isRelevant());

        await new TakeActionBasedOnInformation(this._dependencies, relevantInfoPieces).takeAction();
    }

    public install(): this {
        this._dependencies.onPaused(paused => this.onPause(paused));
        return this;
    }

    constructor(private readonly _dependencies: TakeProperActionOnPausedEventDependencies) { }
}

export interface TakeActionBasedOnInformationDependencies {
    askForInformationAboutPause(paused: PausedEvent): PromiseOrNot<Vote<void>[]>;
    notifyClientDebugeeIsStopped(params: DebugeeIsStoppedParameters): void;
}

export class TakeActionBasedOnInformation {
    private readonly _takeActionBasedOnVotes: ExecuteDecisionBasedOnVotes<void>;

    public async takeAction(): Promise<void> {
        this.validatePieces();
        return this._takeActionBasedOnVotes.execute();
    }

    public validatePieces(): void {
        // DIEGO TODO: Change this to send telemetry instead
        if (this._takeActionBasedOnVotes.getCountOfVotesWithCertainRelevance(VoteRelevance.OverrideOtherVotes) > 1) {
            throw new Error(`Didn't expect to have multiple override information pieces`);
        }

        if (this._takeActionBasedOnVotes.getCountOfVotesWithCertainRelevance(VoteRelevance.NormalVote) > 1) {
            throw new Error(`Didn't expect to have multiple information pieces`);
        }
    }

    constructor(private readonly _dependencies: TakeActionBasedOnInformationDependencies, piecesOfInformation: Vote<void>[]) {
        this._takeActionBasedOnVotes = new ExecuteDecisionBasedOnVotes(async () => {
            // If we don't have any information whatsoever, then we assume that we stopped due to a debugger statement
            return this._dependencies.notifyClientDebugeeIsStopped({ reason: 'debugger_statement' });
        }, piecesOfInformation);
    }
}