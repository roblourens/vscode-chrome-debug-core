import { BasePathTransformer } from '../../../transformers/basePathTransformer';
import { BaseSourceMapTransformer } from '../../../transformers/baseSourceMapTransformer';
import { IScript } from '../scripts/script';
import { ICallFrame } from '../stackTraces/callFrame';
import { PausedEvent } from '../../target/events';
import { InformationAboutPausedProvider } from './takeProperActionOnPausedEvent';
import { logger } from 'vscode-debugadapter';
import { IComponent } from './feature';
import { LocationInLoadedSource } from '../locations/location';
import { ICallFramePresentationDetails } from '../stackTraces/callFramePresentation';
import { Abstained, ReturnValue, VoteRelevance, VoteCommonLogic, Vote } from '../../communication/collaborativeDecision';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export interface SmartStepLogicDependencies {
    // TODO DIEGO: Refactor these away
    readonly pathTransformer: BasePathTransformer;
    readonly sourceMapTransformer: BaseSourceMapTransformer;

    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
    listenToCallFrameAdditionalPresentationDetailsElection(listener: (locationInLoadedSource: LocationInLoadedSource) => Promise<Vote<ICallFramePresentationDetails>>): void;
}

export interface SmartStepLogicConfiguration {
    isEnabled: boolean;
}

export interface ShouldStepInToAvoidSkippedSourceDependencies {
    stepIntoDebugee(): Promise<void>;
}
export class ShouldStepInToAvoidSkippedSource extends VoteCommonLogic<void> {
    public readonly relevance = VoteRelevance.OverrideOtherVotes;

    private readonly _dependencies: ShouldStepInToAvoidSkippedSourceDependencies;

    public async execute(): Promise<void> {
        return this._dependencies.stepIntoDebugee();
    }
}

export class SmartStepLogic implements IComponent<SmartStepLogicConfiguration> {
    private _smartStepCount = 0;
    private _isEnabled = false;

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

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<Vote<void>> {
        if (this.isEnabled() && await this.shouldSkip(paused.callFrames[0])) {
            this._smartStepCount++;
            return new ShouldStepInToAvoidSkippedSource();
        } else {
            if (this._smartStepCount > 0) {
                logger.log(`SmartStep: Skipped ${this._smartStepCount} steps`);
                this._smartStepCount = 0;
            }
            return new Abstained();
        }
    }

    public stepInIfOnSkippedSource(): void {
        throw new Error('Not implemented TODO DIEGO');
    }

    public async shouldSkip(frame: ICallFrame<IScript>): Promise<boolean> {
        if (!this._isEnabled) return false;

        const clientPath = this._dependencies.pathTransformer.getClientPathFromTargetPath(frame.location.script.runtimeSource.identifier)
            || frame.location.script.runtimeSource.identifier;
        const mapping = await this._dependencies.sourceMapTransformer.mapToAuthored(clientPath.canonicalized, frame.codeFlow.location.lineNumber, frame.codeFlow.location.columnNumber);
        if (mapping) {
            return false;
        }

        if ((await this._dependencies.sourceMapTransformer.allSources(clientPath.canonicalized)).length) {
            return true;
        }

        return false;
    }

    public onCallFrameAdditionalPresentationDetailsElection(locationInLoadedSource: LocationInLoadedSource): Vote<ICallFramePresentationDetails> {
        return this.isEnabled && !locationInLoadedSource.source.isSourceOfCompiled()
            ? new ReturnValue<ICallFramePresentationDetails>({
                additionalSourceOrigins: [localize('smartStepFeatureName', 'smartStep')],
                sourcePresentationHint: 'deemphasize'
            })
            : new Abstained<ICallFramePresentationDetails>();
    }

    public install(configuration: SmartStepLogicConfiguration): this {
        this._dependencies.subscriberForAskForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
        this._dependencies.listenToCallFrameAdditionalPresentationDetailsElection(async locationInLoadedSource => this.onCallFrameAdditionalPresentationDetailsElection(locationInLoadedSource));
        this.configure(configuration);
        return this;
    }

    public configure(configuration: SmartStepLogicConfiguration): void {
        this._isEnabled = configuration.isEnabled;
    }

    constructor(private readonly _dependencies: SmartStepLogicDependencies) {
    }
}