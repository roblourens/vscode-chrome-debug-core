/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { inject, injectable } from 'inversify';
import { logger } from 'vscode-debugadapter';
import * as nls from 'vscode-nls';
import { ConnectedCDAConfiguration, utils } from '../../..';
import { BaseSourceMapTransformer } from '../../../transformers/baseSourceMapTransformer';
import { PausedEvent } from '../../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { Abstained, IVote, VoteOverride } from '../../communication/collaborativeDecision';
import { TYPES } from '../../dependencyInjection.ts/types';
import { LocationInLoadedSource } from '../locations/location';
import { ICallFramePresentationDetails } from '../stackTraces/callFramePresentation';
import { IStackTracePresentationLogicProvider } from '../stackTraces/stackTracesLogic';
import { Stepping } from '../stepping/stepping';
import { IComponent } from './feature';
import { InformationAboutPausedProvider } from './takeProperActionOnPausedEvent';

const localize = nls.loadMessageBundle();

export interface IEventsConsumedBySmartStepLogic {
    subscriberForAskForInformationAboutPaused(listener: InformationAboutPausedProvider): void;
}

export interface ISmartStepLogicConfiguration {
    isEnabled: boolean;
}

@injectable()
export class SmartStepLogic implements IComponent, IStackTracePresentationLogicProvider {
    private _smartStepCount = 0;
    private _isEnabled = false;

    public async toggleSmartStep(): Promise<void> {
        this._isEnabled = !this._isEnabled;
        this.sendUpdatedPause();
    }

    public async askForInformationAboutPaused(paused: PausedEvent): Promise<IVote<void>> {
        if (this._isEnabled && await this.shouldSkip(paused)) {
            return new VoteOverride(() => {
                this._smartStepCount++;
                return this._stepping.stepIn();
            });
        } else {
            if (this._smartStepCount > 0) {
                logger.log(`SmartStep: Skipped ${this._smartStepCount} steps`);
                this._smartStepCount = 0;
            }
            return new Abstained(this);
        }
    }

    public sendUpdatedPause(): void {
        // TODO
        // this._eventsToClientReporter.sendDebuggeeIsStopped({ reason: Reason})
    }

    public async shouldSkip(paused: PausedEvent): Promise<boolean> {
        if (!this._isEnabled) return false;

        if (paused.reason !== 'other') return false;

        const frame = paused.callFrames[0];
        const mapping = await this._sourceMapTransformer.mapToAuthored(frame.location.script.url, frame.codeFlow.location.position.lineNumber, frame.codeFlow.location.position.columnNumber);
        if (mapping) {
            return false;
        }

        if ((await this._sourceMapTransformer.allSources(frame.location.script.runtimeSource.identifier.canonicalized)).length) {
            return true;
        }

        return false;
    }

    public getCallFrameAdditionalDetails(locationInLoadedSource: LocationInLoadedSource): ICallFramePresentationDetails[] {
        return this._isEnabled && !locationInLoadedSource.source.isMappedSource()
            ? [{
                additionalSourceOrigins: [localize('smartStepFeatureName', 'smartStep')],
                sourcePresentationHint: 'deemphasize'
            }]
            : [];
    }

    public install(): this {
        this._dependencies.subscriberForAskForInformationAboutPaused(paused => this.askForInformationAboutPaused(paused));
        this.configure();
        return this;
    }

    public configure(): void {
        this._isEnabled = !!utils.defaultIfUndefined(this._configuration.args.smartStep, this._configuration.isVSClient);
    }

    constructor(
        @inject(TYPES.EventsConsumedByConnectedCDA) private readonly _dependencies: IEventsConsumedBySmartStepLogic,
        @inject(TYPES.BaseSourceMapTransformer) private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        @inject(TYPES.ConnectedCDAConfiguration) private readonly _configuration: ConnectedCDAConfiguration,
        @inject(TYPES.Stepping) private readonly _stepping: Stepping
    ) {
    }
}