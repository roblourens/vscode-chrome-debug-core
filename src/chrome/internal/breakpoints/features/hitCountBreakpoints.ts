import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';
import { BPRecipieInUnresolvedSource, IBPRecipie } from '../bpRecipie';
import { BreakOnHitCount } from '../bpActionWhenHit';
import { ValidatedMap } from '../../../collections/validatedMap';
import { HitCountConditionParser, HitCountConditionFunction } from '../hitCountConditionParser';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../../locations/location';
import {  NotifyStoppedCommonLogic, NotifyStoppedDependencies, InformationAboutPausedProvider } from '../../features/takeProperActionOnPausedEvent';
import { ReasonType } from '../../../stoppedEvent';
import { Vote, Abstained, VoteRelevance } from '../../../communication/collaborativeDecision';

export interface HitCountBreakpointsDependencies extends NotifyStoppedDependencies {
    registerAddBPRecipieHandler(handlerRequirements: (bpRecipie: BPRecipieInUnresolvedSource) => boolean,
        handler: (bpRecipie: BPRecipieInUnresolvedSource) => Promise<void>): void;

    addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    notifyBPWasHit(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    resumeProgram(): Promise<void>;

    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
}

class HitCountBPData {
    private _hitCount = 0;

    public notifyBPHit(): VoteRelevance {
        return this._shouldPauseCondition(this._hitCount++)
            ? VoteRelevance.NormalVote
            : VoteRelevance.Abstained;
    }

    constructor(
        public readonly hitBPRecipie: BPRecipieInUnresolvedSource<BreakOnHitCount>,
        private readonly _shouldPauseCondition: HitCountConditionFunction) { }
}

export class HitAndSatisfiedCountBPCondition extends NotifyStoppedCommonLogic {
    public readonly relevance = VoteRelevance.NormalVote;
    protected reason: ReasonType = 'breakpoint';

    constructor(protected readonly _dependencies: NotifyStoppedDependencies) {
        super();
    }
}

export class HitCountBreakpoints implements IFeature {
    private readonly underlyingToBPRecipie = new ValidatedMap<IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>, HitCountBPData>();

    public install(): void {
        this._dependencies.registerAddBPRecipieHandler(
            bpRecipie => bpRecipie.bpActionWhenHit.isBreakOnHitCount(),
            bpRecipie => this.addBPRecipie(bpRecipie as BPRecipieInUnresolvedSource<BreakOnHitCount>));
        this._dependencies.subscriberForAskForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
    }

    private async addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource<BreakOnHitCount>): Promise<void> {
        const underlyingBPRecipie = bpRecipie.withAlwaysBreakAction();
        const shouldPauseCondition = new HitCountConditionParser(bpRecipie.bpActionWhenHit.pauseOnHitCondition).parse();
        this._dependencies.addBPRecipie(underlyingBPRecipie);
        this.underlyingToBPRecipie.set(underlyingBPRecipie, new HitCountBPData(bpRecipie, shouldPauseCondition));
    }

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<Vote<void>> {
        const hitCountBPData = paused.hitBreakpoints.map(hitBPRecipie =>
            this.underlyingToBPRecipie.tryGetting(hitBPRecipie.unmappedBpRecipie)).filter(bpRecipie => bpRecipie !== undefined);

        const individualDecisions = hitCountBPData.map(data => data.notifyBPHit());
        return individualDecisions.indexOf(VoteRelevance.NormalVote) >= 0
            ? new HitAndSatisfiedCountBPCondition(this._dependencies)
            : new Abstained();
    }

    constructor(private readonly _dependencies: HitCountBreakpointsDependencies) { }
}