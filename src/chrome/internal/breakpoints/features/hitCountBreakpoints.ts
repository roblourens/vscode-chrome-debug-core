import { IFeature } from '../../features/feature';
import { PausedEvent } from '../../../target/events';
import { BPRecipieInUnresolvedSource, IBPRecipie } from '../bpRecipie';
import { BreakOnHitCount } from '../bpActionWhenHit';
import { ValidatedMap } from '../../../collections/validatedMap';
import { HitCountConditionParser, HitCountConditionFunction } from '../hitCountConditionParser';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../../locations/location';
import { ShouldPauseForUser } from '../../features/pauseProgramWhenNeeded';

export interface HitCountBreakpointsDependencies {
    registerAddBPRecipieHandler(handlerRequirements: (bpRecipie: BPRecipieInUnresolvedSource) => boolean,
        handler: (bpRecipie: BPRecipieInUnresolvedSource) => Promise<void>): void;

    addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    notifyBPWasHit(bpRecipie: BPRecipieInUnresolvedSource): Promise<void>;
    resumeProgram(): Promise<void>;

    onShouldPauseForUser(listener: (params: PausedEvent) => Promise<ShouldPauseForUser>): void;
}

class HitCountBPData {
    private _hitCount = 0;

    public notifyBPHit(): ShouldPauseForUser {
        return this._shouldPauseCondition(this._hitCount++) ? ShouldPauseForUser.NeedsToPause : ShouldPauseForUser.Abstained;
    }

    constructor(
        public readonly hitBPRecipie: BPRecipieInUnresolvedSource<BreakOnHitCount>,
        private readonly _shouldPauseCondition: HitCountConditionFunction) { }
}

export class HitCountBreakpoints implements IFeature {
    private readonly underlyingToBPRecipie = new ValidatedMap<IBPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>, HitCountBPData>();

    public install(): void {
        this._dependencies.registerAddBPRecipieHandler(
            bpRecipie => bpRecipie.bpActionWhenHit.isBreakOnHitCount(),
            bpRecipie => this.addBPRecipie(bpRecipie as BPRecipieInUnresolvedSource<BreakOnHitCount>));
        this._dependencies.onShouldPauseForUser(paused => this.onShouldPauseForUser(paused));
    }

    private async addBPRecipie(bpRecipie: BPRecipieInUnresolvedSource<BreakOnHitCount>): Promise<void> {
        const underlyingBPRecipie = bpRecipie.withAlwaysBreakAction();
        const shouldPauseCondition = new HitCountConditionParser(bpRecipie.bpActionWhenHit.pauseOnHitCondition).parse();
        this._dependencies.addBPRecipie(underlyingBPRecipie);
        this.underlyingToBPRecipie.set(underlyingBPRecipie, new HitCountBPData(bpRecipie, shouldPauseCondition));
    }

    public async onShouldPauseForUser(paused: PausedEvent): Promise<ShouldPauseForUser> {
        const hitCountBPData = paused.hitBreakpoints.map(hitBPRecipie =>
            this.underlyingToBPRecipie.tryGetting(hitBPRecipie.unmappedBpRecipie)).filter(bpRecipie => bpRecipie !== undefined);

        const shouldPauses = hitCountBPData.map(data => data.notifyBPHit());
        return shouldPauses.indexOf(ShouldPauseForUser.NeedsToPause) >= 0
            ? ShouldPauseForUser.NeedsToPause
            : ShouldPauseForUser.Abstained;
    }

    constructor(private readonly _dependencies: HitCountBreakpointsDependencies) { }
}