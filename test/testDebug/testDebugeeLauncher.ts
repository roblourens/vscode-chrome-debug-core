import { IDebuggeeLauncher, ILaunchRequestArgs, ILaunchResult, ITelemetryPropertyCollector } from '../../src';

export class TestDebugeeLauncher implements IDebuggeeLauncher {
    public async launch(_args: ILaunchRequestArgs, _telemetryPropertyCollector: ITelemetryPropertyCollector): Promise<ILaunchResult> {
        return {

        };
    }

    public async waitForDebugeeToBeReady(): Promise<void> {
    }
}