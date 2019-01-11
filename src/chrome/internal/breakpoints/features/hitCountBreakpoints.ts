import { IComponent } from '../../features/feature';
import { BPRecipieInUnresolvedSource, AnyBPRecipie } from '../bpRecipie';
import { BreakOnHitCount } from '../bpActionWhenHit';
import { ValidatedMap } from '../../../collections/validatedMap';
import { HitCountConditionParser, HitCountConditionFunction } from '../hitCountConditionParser';
import { NotifyStoppedCommonLogic, InformationAboutPausedProvider } from '../../features/takeProperActionOnPausedEvent';
import { ReasonType } from '../../../stoppedEvent';
import { Vote, Abstained, VoteRelevance } from '../../../communication/collaborativeDecision';
import { injectable, inject } from 'inversify';
import { IEventsToClientReporter } from '../../../client/eventSender';
import { TYPES } from '../../../dependencyInjection.ts/types';
import { PausedEvent } from '../../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';

export interface HitCountBreakpointsDependencies {
    registerAddBPRecipieHandler(handlerRequirements: (bpRecipie: BPRecipieInUnresolvedSource) => boolean,
        handler: (bpRecipie: BPRecipieInUnresolvedSource) => Promise<void>): void;

    addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    notifyBPWasHit(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;

    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    publishGoingToPauseClient(): void;
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

    constructor(protected readonly _eventsToClientReporter: IEventsToClientReporter,
        protected readonly _publishGoingToPauseClient: () => void) {
        super();
    }
}

// TODO DIEGO: Install and use this feature
@injectable()
export class HitCountBreakpoints implements IComponent {
    private readonly underlyingToBPRecipie = new ValidatedMap<AnyBPRecipie, HitCountBPData>();

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
            this.underlyingToBPRecipie.tryGetting(hitBPRecipie.unmappedBPRecipie)).filter(bpRecipie => bpRecipie !== undefined);

        const individualDecisions = hitCountBPData.map(data => data.notifyBPHit());
        return individualDecisions.indexOf(VoteRelevance.NormalVote) >= 0
            ? new HitAndSatisfiedCountBPCondition(this._eventsToClientReporter, this._dependencies.publishGoingToPauseClient)
            : new Abstained(this);
    }

    constructor(private readonly _dependencies: HitCountBreakpointsDependencies,
        @inject(TYPES.IEventsToClientReporter) private readonly _eventsToClientReporter: IEventsToClientReporter) { }
}