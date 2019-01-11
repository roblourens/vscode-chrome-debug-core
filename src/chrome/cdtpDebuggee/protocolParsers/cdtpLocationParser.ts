import { Coordinates, LocationInScript } from '../../internal/locations/location';
import { createColumnNumber, createLineNumber } from '../../internal/locations/subtypes';
import { CDTPScriptsRegistry } from '../registries/cdtpScriptsRegistry';
import { Protocol as CDTP } from 'devtools-protocol';

interface HasCoordinates {
    lineNumber: number;
    columnNumber?: number;
}

interface HasScript {
    scriptId: CDTP.Runtime.ScriptId;
}

export interface HasScriptLocation extends HasCoordinates, HasScript { }

export class CDTPLocationParser {
    public async getLocationInScript(crdpObjectWithScriptLocation: HasScriptLocation): Promise<LocationInScript> {
        return new LocationInScript(await this._scriptsRegistry.getScriptByCdtpId(crdpObjectWithScriptLocation.scriptId),
            this.getCoordinates(crdpObjectWithScriptLocation));
    }

    private getCoordinates(crdpObjectWithCoordinates: HasCoordinates): Coordinates {
        return new Coordinates(createLineNumber(crdpObjectWithCoordinates.lineNumber), createColumnNumber(crdpObjectWithCoordinates.columnNumber));
    }

    constructor(private _scriptsRegistry: CDTPScriptsRegistry) { }
}
