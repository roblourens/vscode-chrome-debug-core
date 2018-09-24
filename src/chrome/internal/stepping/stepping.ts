import { IFeature } from '../features/feature';
import { AsyncSteppingDependencies, AsyncStepping } from './features/asyncStepping';

export interface SteppingDependencies extends AsyncSteppingDependencies {

}

export class Stepping implements IFeature {
    private readonly asyncStepping = new AsyncStepping(this._depenencies);

    public install(): void {
        this.asyncStepping.install();
    }

    constructor(private readonly _depenencies: SteppingDependencies) { }
}