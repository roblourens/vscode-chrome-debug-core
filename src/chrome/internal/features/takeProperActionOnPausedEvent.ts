import { IFeature } from './feature';
import { PausedEvent } from '../../target/events';
import { ValidatedMultiMap } from '../../collections/validatedMultiMap';
import { DebugeeIsStoppedParameters } from '../../client/eventSender';
import { groupByKey } from '../../collections/utilities';
import { ReasonType } from '../../stoppedEvent';
import { PromiseOrNot } from '../../utils/promises';

export enum ActionRelevance {
    OverrideOtherActions,
    NormalAction,
    FallbackAction,
    Ignored,
}

export interface PossibleAction {
    relevance: ActionRelevance;
    isRelevant(): boolean;

    execute(remainingRelevantActions: PossibleAction[]): Promise<void>;
}

export abstract class PossibleActionCommonLogic implements PossibleAction {
    public abstract execute(): Promise<void>;
    public abstract get relevance(): ActionRelevance;

    public isRelevant(): boolean {
        return this.relevance !== ActionRelevance.Ignored;
    }
}

export interface NotifyStoppedDependencies {
    notifyClientDebugeeIsStopped(params: DebugeeIsStoppedParameters): void;
}

export interface ResumeDependencies {
    resumeProgram(): void;
}

export abstract class ResumeCommonLogic extends PossibleActionCommonLogic {
    protected readonly abstract _dependencies: ResumeDependencies;

    public async execute(): Promise<void> {
        this._dependencies.resumeProgram();
    }
}

export abstract class NotifyStoppedCommonLogic extends PossibleActionCommonLogic {
    protected readonly exception: any;
    protected readonly abstract reason: ReasonType;
    protected readonly abstract _dependencies: NotifyStoppedDependencies;

    public async execute(): Promise<void> {
        this._dependencies.notifyClientDebugeeIsStopped({ reason: this.reason, exception: this.exception });
    }
}

export class NoInformation extends PossibleActionCommonLogic {
    public readonly relevance = ActionRelevance.Ignored;

    public async execute(): Promise<void> {
        // Do nothing
    }
}

export type InformationAboutPausedProvider = (paused: PausedEvent) => (Promise<PossibleAction> | PossibleAction);

export interface TakeProperActionOnPausedEventDependencies extends TakeActionBasedOnInformationDependencies {
    onPaused(listener: (paused: PausedEvent) => Promise<void> | void): void;
}

export class TakeProperActionOnPausedEvent implements IFeature {
    public async onPause(paused: PausedEvent): Promise<void> {
        // Ask all the listeners what information they can provide
        const infoPieces = await this._dependencies.askForInformationAboutPause(paused);

        // Remove pieces without any relevant information
        const relevantInfoPieces = infoPieces.filter(response => response.isRelevant());

        await new TakeActionBasedOnInformation(this._dependencies, relevantInfoPieces).takeAction();
    }

    public install(): TakeProperActionOnPausedEvent {
        this._dependencies.onPaused(paused => this.onPause(paused));
        return this;
    }

    constructor(private readonly _dependencies: TakeProperActionOnPausedEventDependencies) { }
}

export interface TakeActionBasedOnInformationDependencies {
    askForInformationAboutPause(paused: PausedEvent): PromiseOrNot<PossibleAction[]>;
    notifyClientDebugeeIsStopped(params: DebugeeIsStoppedParameters): void;
}

export class TakeActionBasedOnInformation {
    private readonly _piecesByRelevance: ValidatedMultiMap<ActionRelevance, PossibleAction>;

    public async takeAction(): Promise<void> {
        this.validatePieces();

        const overrideInfoPieces = this.getPieces(ActionRelevance.OverrideOtherActions);
        const infoPieces = this.getPieces(ActionRelevance.NormalAction);
        const fallbackInfoPieces = this.getPieces(ActionRelevance.FallbackAction);

        // If we have override or info pieces use those, if not use the fallback ones
        let allRelevatPieces = overrideInfoPieces.concat(infoPieces) || fallbackInfoPieces;

        if (allRelevatPieces.length > 0) {
            const infoPiece = allRelevatPieces[0]; // We'd normally expect to have a single piece in this array
            infoPiece.execute(allRelevatPieces);
        } else {
            // If we don't have any information whatsoever, then we assume that we stopped due to a debugger statement
            return this._dependencies.notifyClientDebugeeIsStopped({ reason: 'debugger_statement' });
        }
    }

    public validatePieces(): void {
        // DIEGO TODO: Change this to send telemetry instead
        if (this.getPiecesCount(ActionRelevance.OverrideOtherActions) > 1) {
            throw new Error(`Didn't expect to have multiple override information pieces`);
        }

        if (this.getPiecesCount(ActionRelevance.NormalAction) > 1) {
            throw new Error(`Didn't expect to have multiple information pieces`);
        }
    }

    public getPiecesCount(relevance: ActionRelevance): number {
        return this.getPieces(relevance).length;
    }

    private getPieces(relevance: ActionRelevance): PossibleAction[] {
        return Array.from(this._piecesByRelevance.tryGetting(relevance) || []);
    }

    constructor(private readonly _dependencies: TakeActionBasedOnInformationDependencies,
        piecesOfInformation: PossibleAction[]) {
        this._piecesByRelevance = groupByKey(piecesOfInformation, infoPiece => infoPiece.relevance);
    }
}