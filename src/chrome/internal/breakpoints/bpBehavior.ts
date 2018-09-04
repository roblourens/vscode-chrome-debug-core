export interface IBPBehavior {
    isEquivalent(behavior: IBPBehavior): boolean;

    execute<R>(actionBasedOnClass: {
        alwaysBreak?: (alwaysBreak: AlwaysBreak) => R,
        conditionalBreak?: (conditionalBreak: ConditionalBreak) => R,
        logMessage?: (logMessage: LogMessage) => R,
        breakOnSpecificHitCounts?: (breakOnSpecificHitCounts: BreakOnSpecificHitCounts) => R
    }): R;
}

export abstract class BehaviorRecipieCommonLogic implements IBPBehavior {
    public abstract isEquivalent(behavior: IBPBehavior): boolean;

    execute<R>(actionBasedOnClass: {
        alwaysBreak?: (alwaysBreak: AlwaysBreak) => R,
        conditionalBreak?: (conditionalBreak: ConditionalBreak) => R,
        logMessage?: (logMessage: LogMessage) => R,
        breakOnSpecificHitCounts?: (breakOnSpecificHitCounts: BreakOnSpecificHitCounts) => R;
    }): R {
        if (this instanceof AlwaysBreak && actionBasedOnClass.alwaysBreak) {
            return actionBasedOnClass.alwaysBreak(this);
        } else if (this instanceof ConditionalBreak && actionBasedOnClass.conditionalBreak) {
            return actionBasedOnClass.conditionalBreak(this);
        } else if (this instanceof LogMessage && actionBasedOnClass.logMessage) {
            return actionBasedOnClass.logMessage(this);
        } else if (this instanceof BreakOnSpecificHitCounts && actionBasedOnClass.breakOnSpecificHitCounts) {
            return actionBasedOnClass.breakOnSpecificHitCounts(this);
        } else {
            throw new Error(`Unexpected case. The logic wasn't prepared to handle the specified behavior: ${this}`);
        }
    }
}

export class AlwaysBreak extends BehaviorRecipieCommonLogic implements IBPBehavior {
    public isEquivalent(otherBehavior: IBPBehavior): boolean {
        return otherBehavior.execute({
            alwaysBreak: () => true,
            conditionalBreak: () => false,
            logMessage: () => false,
            breakOnSpecificHitCounts: () => false,
        });
    }

    public toString(): string {
        return 'always break';
    }
}

export class LogMessage extends BehaviorRecipieCommonLogic implements IBPBehavior {
    public isEquivalent(otherBehavior: IBPBehavior): boolean {
        return otherBehavior.execute({
            alwaysBreak: () => false,
            conditionalBreak: () => false,
            logMessage: b => b.expressionOfMessageToLog === this.expressionOfMessageToLog,
            breakOnSpecificHitCounts: () => false,
        });
    }

    public toString(): string {
        return `log: ${this.expressionOfMessageToLog}`;
    }

    constructor(public readonly expressionOfMessageToLog: string) {
        super();
    }
}

export class ConditionalBreak extends BehaviorRecipieCommonLogic implements IBPBehavior {
    public isEquivalent(otherBehavior: IBPBehavior): boolean {
        return otherBehavior.execute({
            alwaysBreak: () => false,
            conditionalBreak: b => b.expressionOfWhenToBreak === this.expressionOfWhenToBreak,
            logMessage: () => false,
            breakOnSpecificHitCounts: () => false,
        });
    }

    public toString(): string {
        return `break if: ${this.expressionOfWhenToBreak}`;
    }

    constructor(public readonly expressionOfWhenToBreak: string) {
        super();
    }
}

export class BreakOnSpecificHitCounts extends BehaviorRecipieCommonLogic implements IBPBehavior {
    public isEquivalent(otherBehavior: IBPBehavior): boolean {
        return otherBehavior.execute({
            alwaysBreak: () => false,
            conditionalBreak: () => false,
            logMessage: () => false,
            breakOnSpecificHitCounts: b => b.expressionOfOnWhichHitsToBreak === this.expressionOfOnWhichHitsToBreak,
        });
    }

    public toString(): string {
        return `break when hits: ${this.expressionOfOnWhichHitsToBreak}`;
    }

    constructor(public readonly expressionOfOnWhichHitsToBreak: string) {
        super();
    }
}
