import { BasePathTransformer } from '../../../transformers/basePathTransformer';
import { BaseSourceMapTransformer } from '../../../transformers/baseSourceMapTransformer';
import { IScript } from '../scripts/script';
import { ICallFrame } from '../stackTraces/callFrame';

export interface SmartStepLogicDependencies {

}

export class SmartStepLogic {
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
        this.reprocessPausedEvent();
    }

    public reprocessPausedEvent(): void {
        this.onPaused(this._lastPauseState.event, this._lastPauseState.expecting);
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

    constructor(
        private readonly _dependencies: SmartStepLogicDependencies,
        private readonly _pathTransformer: BasePathTransformer,
        private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        private _isEnabled: boolean) {
    }
}