import { IRuntimeScript } from './runtimeScript';

export interface IZeroBasedLocation {
    readonly lineNumber: number;
    readonly columnNumber?: number;
}

// TODO DIEGO rename to: IRuntimeScriptCodeLocation
export interface IRuntimeScriptLocation extends IZeroBasedLocation {
    runtimeScript: IRuntimeScript;
}
