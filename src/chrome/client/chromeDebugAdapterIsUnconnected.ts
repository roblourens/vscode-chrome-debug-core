import { UnconnectedCDACommonLogic, ChromeDebugAdapterState } from './chromeDebugAdapterState';
import { IDebugAdapter, ILaunchRequestArgs, ITelemetryPropertyCollector, IAttachRequestArgs, ChromeDebugLogic } from '../..';
import { ConnectedCDA } from './chromeDebugAdapterIsConnected';
import { ScenarioType, ModelCreator } from './targetConnectionCreator';

export class UnconnectedCDA extends UnconnectedCDACommonLogic implements IDebugAdapter {
    public chromeDebugAdapter(): ChromeDebugLogic {
        throw new Error('The chrome debug adapter can only be used when the debug adapter is connected');
    }

    public async launch(_args: ILaunchRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<ChromeDebugAdapterState> {
        return this.createConnection(ScenarioType.Launch);
    }

    public async attach(_args: IAttachRequestArgs, _telemetryPropertyCollector?: ITelemetryPropertyCollector, _requestSeq?: number): Promise<ChromeDebugAdapterState> {
        return this.createConnection(ScenarioType.Attach);
    }

    private async createConnection(scenarioType: ScenarioType): Promise<ChromeDebugAdapterState> {
        return await new ModelCreator().create();
        this._session.sendEvent(new InitializedEvent());
    }
}