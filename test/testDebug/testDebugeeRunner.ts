import { ITelemetryPropertyCollector } from '../../src';
import { IDebuggeeRunner } from '../../src/chrome/debugee/debugeeLauncher';
import { CDTPDiagnostics } from '../../src/chrome/target/cdtpDiagnostics';

export class TestDebugeeRunner implements IDebuggeeRunner {
    public async run(_telemetryPropertyCollector: ITelemetryPropertyCollector): Promise<void> {
    }

    constructor(readonly _chrome: CDTPDiagnostics) { }
}