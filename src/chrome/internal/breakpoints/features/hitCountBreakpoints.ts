import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';
import { BPRecipieInUnresolvedSource, IBPRecipie } from '../bpRecipie';
import { BreakOnHitCount } from '../bpActionWhenHit';
import { ValidatedMap } from '../../../collections/validatedMap';
import { HitCountConditionParser, HitCountConditionFunction } from '../hitCountConditionParser';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../../locations/location';
import { PossibleAction, NoInformation, ActionRelevance, NotifyStoppedCommonLogic, NotifyStoppedDependencies } from '../../features/takeProperActionOnPausedEvent';
import { ReasonType } from '../../../stoppedEvent';

export interface HitCountBreakpointsDependencies extends NotifyStoppedDependencies {
    registerAddBPRecipieHandler(handlerRequirements: (bpRecipie: BPRecipieInUnresolvedSource) => boolean,
        handler: (bpRecipie: BPRecipieInUnresolvedSource) => Promise<void>): void;

    addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    notifyBPWasHit(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    resumeProgram(): Promise<void>;

    askForInformationAboutPaused(listener: (params: PausedEvent) => Promise<PossibleAction>): void;
}

class HitCountBPData {
    private _hitCount = 0;

    public notifyBPHit(): ActionRelevance {
        return this._shouldPauseCondition(this._hitCount++)
            ? ActionRelevance.NormalAction
            : ActionRelevance.Ignored;
    }

    constructor(
        public readonly hitBPRecipie: BPRecipieInUnresolvedSource<BreakOnHitCount>,
        private readonly _shouldPauseCondition: HitCountConditionFunction) { }
}

export class HitAndSatisfiedCountBPCondition extends NotifyStoppedCommonLogic {
    public readonly relevance = ActionRelevance.NormalAction;
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
        this._dependencies.askForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
    }

    private async addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource<BreakOnHitCount>): Promise<void> {
        const underlyingBPRecipie = bpRecipie.withAlwaysBreakAction();
        const shouldPauseCondition = new HitCountConditionParser(bpRecipie.bpActionWhenHit.pauseOnHitCondition).parse();
        this._dependencies.addBPRecipie(underlyingBPRecipie);
        this.underlyingToBPRecipie.set(underlyingBPRecipie, new HitCountBPData(bpRecipie, shouldPauseCondition));
    }

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<PossibleAction> {
        const hitCountBPData = paused.hitBreakpoints.map(hitBPRecipie =>
            this.underlyingToBPRecipie.tryGetting(hitBPRecipie.unmappedBpRecipie)).filter(bpRecipie => bpRecipie !== undefined);

        const individualDecisions = hitCountBPData.map(data => data.notifyBPHit());
        return individualDecisions.indexOf(ActionRelevance.NormalAction) >= 0
            ? new HitAndSatisfiedCountBPCondition(this._dependencies)
            : new NoInformation();
    }

    constructor(private readonly _dependencies: HitCountBreakpointsDependencies) { }
}