export interface IBehaviorRecipie {
    execute<R>(actionBasedOnClass: {
        alwaysBreak?: (alwaysBreak: AlwaysBreak) => R,
        conditionalBreak?: (conditionalBreak: ConditionalBreak) => R,
        logMessage?: (logMessage: LogMessage) => R,
        breakOnSpecificHitCounts?: (breakOnSpecificHitCounts: BreakOnSpecificHitCounts) => R
    }): R;
}

export class BehaviorRecipieCommonLogic implements IBehaviorRecipie {
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

export class AlwaysBreak extends BehaviorRecipieCommonLogic implements IBehaviorRecipie {
}

export class LogMessage extends BehaviorRecipieCommonLogic implements IBehaviorRecipie {
    constructor(public readonly expressionOfMessageToLog: string) {
        super();
    }
}

export class ConditionalBreak extends BehaviorRecipieCommonLogic implements IBehaviorRecipie {
    constructor(public readonly expressionOfWhenToBreak: string) {
        super();
    }
}

export class BreakOnSpecificHitCounts extends BehaviorRecipieCommonLogic implements IBehaviorRecipie {
    constructor(public readonly expressionOfOnWhichHitsToBreak: string) {
        super();
    }
}
