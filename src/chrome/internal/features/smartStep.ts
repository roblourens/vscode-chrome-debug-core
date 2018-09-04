import { BasePathTransformer } from '../../../transformers/basePathTransformer';
import { BaseSourceMapTransformer } from '../../../transformers/baseSourceMapTransformer';
import { IScript } from '../scripts/script';
import { ICallFrame } from '../stackTraces/callFrame';

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

    constructor(private readonly _pathTransformer: BasePathTransformer,
        private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        private _isEnabled: boolean) {

    }

    public async shouldSkip(frame: ICallFrame<IScript>): Promise<boolean> {
        if (!this._isEnabled) return false;

        const clientPath = this._pathTransformer.getClientPathFromTargetPath(frame.location.source) || frame.location.source;
        const mapping = await this._sourceMapTransformer.mapToAuthored(clientPath.canonicalized, frame.codeFlow.location.lineNumber, frame.codeFlow.location.columnNumber);
        if (mapping) {
            return false;
        }

        if ((await this._sourceMapTransformer.allSources(clientPath.canonicalized)).length) {
            return true;
        }

        return false;
    }
}