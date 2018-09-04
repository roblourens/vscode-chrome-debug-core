import { IFeature } from '../features/feature';
import { AsyncSteppingDependencies, AsyncStepping } from './features/asyncStepping';
import { SyncStepping, SyncSteppingDependencies } from './features/syncStepping';
import { ICallFrame } from '../stackTraces/callFrame';
import { IScript } from '../scripts/script';

export interface SteppingDependencies extends AsyncSteppingDependencies, SyncSteppingDependencies {}

export class Stepping implements IFeature {
    private readonly _syncStepping = new SyncStepping(this._depenencies);
    private readonly _asyncStepping = new AsyncStepping(this._depenencies);

    public continue(): Promise<void> {
        return this._syncStepping.continue();
    }

    public next(): Promise<void> {
        return this._syncStepping.stepOver();
    }

    public stepIn(): Promise<void> {
        return this._syncStepping.stepInto();
    }

    public stepOut(): Promise<void> {
        return this._syncStepping.stepOut();
    }

    public pause(): Promise<void> {
        return this._syncStepping.pause();
    }

    public restartFrame(callFrame: ICallFrame<IScript>): Promise<void> {
        return this._syncStepping.restartFrame(callFrame);
    }

    public install(): this {
        this._asyncStepping.install();
        return this;
    }

    constructor(private readonly _depenencies: SteppingDependencies) { }
}