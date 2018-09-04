import { UnconnectedCDACommonLogic } from './chromeDebugAdapterState';
import { IDebugAdapter, ILaunchRequestArgs, ITelemetryPropertyCollector, IAttachRequestArgs, ChromeDebugLogic } from '../..';
import { ConnectedCDA } from './chromeDebugAdapterIsConnected';
import { ScenarioType, TargetConnectionConfigurator, ModelCreator } from './targetConnectionCreator';

export class UnconnectedCDA extends UnconnectedCDACommonLogic implements IDebugAdapter {
    public chromeDebugAdapter(): ChromeDebugLogic {
        throw new Error('The chrome debug adapter can only be used when the debug adapter is connected');
    }

    public launch(_args: ILaunchRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<ConnectedCDA> {
        return this.createConnection(ScenarioType.Launch);
    }

    public attach(_args: IAttachRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<ConnectedCDA> {
        return this.createConnection(ScenarioType.Attach);
    }

    private async createConnection(scenarioType: ScenarioType): Promise<ConnectedCDA> {
        new TargetConnectionConfigurator().configure();
        return await new ModelCreator().create();
    }
}