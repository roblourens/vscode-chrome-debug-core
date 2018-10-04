import { BasePathTransformer } from '../../../transformers/basePathTransformer';
import { BaseSourceMapTransformer } from '../../../transformers/baseSourceMapTransformer';
import { IScript } from '../scripts/script';
import { ICallFrame } from '../stackTraces/callFrame';
import { PausedEvent } from '../../target/events';
import { PossibleAction, NoInformation, PossibleActionCommonLogic, ActionRelevance, InformationAboutPausedProvider } from './takeProperActionOnPausedEvent';
import { logger } from 'vscode-debugadapter';
import { IFeature } from './feature';

export interface SmartStepLogicDependencies {
    askForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
}

export interface ShouldStepInToAvoidSkippedSourceDependencies {
    stepIntoDebugee(): Promise<void>;
}
export class ShouldStepInToAvoidSkippedSource extends PossibleActionCommonLogic {
    public readonly relevance = ActionRelevance.OverrideOtherActions;

    private readonly  _dependencies: ShouldStepInToAvoidSkippedSourceDependencies;

    public async execute(): Promise<void> {
        return this._dependencies.stepIntoDebugee();
    }
}

export class SmartStepLogic implements IFeature {
    private _smartStepCount = 0;

    public isEnabled(): boolean {
        return this._isEnabled;
    }

    public toggleEnabled(): void {
        this.enable(!this._isEnabled);
    }

    public enable(shouldEnable: boolean): void {
        this._isEnabled = shouldEnable;
    }

    public async toggleSmartStep(): Promise<void> {
        this.toggleEnabled();
        this.stepInIfOnSkippedSource();
    }

    public async askForInformationAboutPaused(notification: PausedEvent): Promise<PossibleAction> {
        if (this.isEnabled() && await this.shouldSkip(notification.callFrames[0])) {
            this._smartStepCount++;
            return new ShouldStepInToAvoidSkippedSource();
        } else {
            if (this._smartStepCount > 0) {
                logger.log(`SmartStep: Skipped ${this._smartStepCount} steps`);
                this._smartStepCount = 0;
            }
            return new NoInformation();
        }
    }

    public stepInIfOnSkippedSource(): void {
        throw new Error('Not implemented TODO DIEGO');
    }

    public async shouldSkip(frame: ICallFrame<IScript>): Promise<boolean> {
        if (!this._isEnabled) return false;

        const clientPath = this._pathTransformer.getClientPathFromTargetPath(frame.location.script.runtimeSource.identifier)
            || frame.location.script.runtimeSource.identifier;
        const mapping = await this._sourceMapTransformer.mapToAuthored(clientPath.canonicalized, frame.codeFlow.location.lineNumber, frame.codeFlow.location.columnNumber);
        if (mapping) {
            return false;
        }

        if ((await this._sourceMapTransformer.allSources(clientPath.canonicalized)).length) {
            return true;
        }

        return false;
    }

    public install(): void {
        this._dependencies.askForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
    }

    constructor(
        private readonly _dependencies: SmartStepLogicDependencies,
        private readonly _pathTransformer: BasePathTransformer,
        private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        private _isEnabled: boolean) {
    }
}