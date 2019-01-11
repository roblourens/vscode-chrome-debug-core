import { ITelemetryPropertyCollector } from '../../src';
import { IDebuggeeRunner } from '../../src/chrome/debugeeStartup/debugeeLauncher';

export class TestDebugeeRunner implements IDebuggeeRunner {
    public async run(_telemetryPropertyCollector: ITelemetryPropertyCollector): Promise<void> {
    }

    constructor() { }
}