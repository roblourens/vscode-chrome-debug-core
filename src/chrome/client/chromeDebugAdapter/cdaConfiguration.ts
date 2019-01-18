/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

 import { IExtensibilityPoints } from '../../extensibility/extensibilityPoints';
import { IClientCapabilities, ILaunchRequestArgs, IAttachRequestArgs } from '../../../debugAdapterInterfaces';
import { ChromeConnection } from '../../chromeConnection';
import { ILoggingConfiguration } from '../../internal/services/logging';
import { ScenarioType } from './unconnectedCDA';
import { injectable } from 'inversify';
import { ISession } from '../session';
import * as utils from '../../../utils';

export interface IConnectedCDAConfiguration {
    args: ILaunchRequestArgs | IAttachRequestArgs;
    isVSClient: boolean;
    _extensibilityPoints: IExtensibilityPoints;
    loggingConfiguration: ILoggingConfiguration;
    _session: ISession;
    _clientCapabilities: IClientCapabilities;
    _chromeConnectionClass: typeof ChromeConnection;
    scenarioType: ScenarioType;
}

@injectable()
export class ConnectedCDAConfiguration implements IConnectedCDAConfiguration {
    public readonly args: ILaunchRequestArgs | IAttachRequestArgs;

    public readonly isVSClient = this._clientCapabilities.clientID === 'visualstudio';

    constructor(public readonly _extensibilityPoints: IExtensibilityPoints,
        public readonly loggingConfiguration: ILoggingConfiguration,
        public readonly _session: ISession,
        public readonly _clientCapabilities: IClientCapabilities,
        public readonly _chromeConnectionClass: typeof ChromeConnection,
        public readonly scenarioType: ScenarioType,
        private readonly originalArgs: ILaunchRequestArgs | IAttachRequestArgs) {
        this.args = this._extensibilityPoints.updateArguments(this.originalArgs);

        if (this.args.pathMapping) {
            for (const urlToMap in this.args.pathMapping) {
                this.args.pathMapping[urlToMap] = utils.canonicalizeUrl(this.args.pathMapping[urlToMap]);
            }
        }
    }
}
