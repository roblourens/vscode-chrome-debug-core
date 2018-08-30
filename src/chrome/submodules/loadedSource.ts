import { IRuntimeScript } from './runtimeScript';
import { IResourceIdentifier, IResourceLocation } from './resourceIdentifier';

export interface ISourceIdentifier {
    path: string; // TODO: Try to remove this method
    identifier: IResourceIdentifier;
    isRuntimeScriptSource(): boolean;
}

// This represents a path where we can find the source
export class SourceIdentifiedByPath implements ISourceIdentifier {
    public isRuntimeScriptSource(): boolean {
        return false;
    }

    public get identifier(): IResourceIdentifier {
        return this._identifier;
    }

    public get path(): string {
        // TODO: Try to remove this method
        return this._identifier.textRepresentation;
    }

    constructor(private _identifier: IResourceIdentifier) { }
}

// This represents a path to a development source that was compiled to generate the runtime code of the script
export class DevelopmentSourceOfRuntimeScript implements ISourceIdentifier {
    public isRuntimeScriptSource(): boolean {
        return false;
    }

    constructor(private _runtimeScript: IRuntimeScript, private _identifier: IResourceIdentifier) {

    }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get identifier(): IResourceIdentifier {
        return this._identifier;
    }

    public get path(): string {
        return this._identifier.textRepresentation;
    }
}

export interface IRuntimeScriptSource extends ISourceIdentifier {
    /* This class represent the actual javascript code that is being run. The file after compilation.
    It does *not* represent any files prior to compilation. ISourceIdentifier is used to represent those */
    runtimeScript: IRuntimeScript;
}

/**
 * Loaded Source classification:
 * Is the script content available on a single place, or two places? (e.g.: You can find similar scripts in multiple different paths)
 *  1. Single: Is the single place on storage, or is this a dynamic script?
 *      Single path on storage: RuntimeScriptRunFromStorage
 *      Single path not on storage: DynamicRuntimeScript
 *  2. Two: We assume one path is from the webserver, and the other path is in the workspace: RuntimeScriptWithSourceOnWorkspace
 */

export class RuntimeScriptRunFromStorage implements IRuntimeScriptSource {
    public isRuntimeScriptSource(): boolean {
        return true;
    }

    constructor(private _runtimeScript: IRuntimeScript, private readonly _location: IResourceLocation) { }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._location.textRepresentation;
    }

    public get identifier(): IResourceIdentifier {
        return this._location;
    }
}

export class DynamicRuntimeScript implements IRuntimeScriptSource {
    public isRuntimeScriptSource(): boolean {
        return true;
    }

    constructor(private _runtimeScript: IRuntimeScript, private readonly _location: IResourceLocation) { }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._location.textRepresentation;
    }

    public get identifier(): IResourceIdentifier {
        return this._location;
    }
}

export class RuntimeScriptWithSourceInDevelopmentEnvironment implements IRuntimeScriptSource {
    public isRuntimeScriptSource(): boolean {
        return true;
    }

    constructor(private _runtimeScript: IRuntimeScript, private _locationInRuntimeEnvironment: IResourceLocation, private readonly _locationInDevelopmentEnvinronment: IResourceLocation) {

    }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._locationInDevelopmentEnvinronment.textRepresentation;
    }

    public get identifier(): IResourceLocation {
        return this._locationInRuntimeEnvironment;
    }
}
