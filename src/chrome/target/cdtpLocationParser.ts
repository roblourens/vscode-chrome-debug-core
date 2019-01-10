import { Coordinates, LocationInScript } from '../internal/locations/location';
import { createColumnNumber, createLineNumber } from '../internal/locations/subtypes';
import { CDTPScriptsRegistry } from './cdtpScriptsRegistry';
import { injectable, inject } from 'inversify';
import { TYPES } from '../dependencyInjection.ts/types';
import { Crdp } from '../..';

interface HasLocation {
    lineNumber: number;
    columnNumber?: number;
}

interface HasScript {
    scriptId: Crdp.Runtime.ScriptId;
}

export interface HasScriptLocation extends HasLocation, HasScript { }

@injectable()
export class CDTPLocationParser {
    public async getPositionInScript(crdpScriptLocation: HasScriptLocation): Promise<LocationInScript> {
        return new LocationInScript(await this._scriptsRegistry.getScriptById(crdpScriptLocation.scriptId),
            this.getLocation(crdpScriptLocation));
    }

    private getLocation(crdpLocation: HasLocation): Coordinates {
        return new Coordinates(createLineNumber(crdpLocation.lineNumber), createColumnNumber(crdpLocation.columnNumber));
    }

    constructor(
        @inject(TYPES.CDTPScriptsRegistry) private _scriptsRegistry: CDTPScriptsRegistry) { }
}
