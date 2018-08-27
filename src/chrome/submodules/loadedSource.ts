import { IRuntimeScript } from './runtimeScript';

export interface ISourceIdentifier {
    path: string;
    isRuntimeScriptSource(): boolean;
}

export class SourceIdentifiedByPath implements ISourceIdentifier {
    public isRuntimeScriptSource(): boolean {
        return false;
    }

    constructor(private _path: string) {

    }

    public get path(): string {
        return this._path;
    }
}

export class AuthoredSourceOfRuntimeScript implements ISourceIdentifier {
    public isRuntimeScriptSource(): boolean {
        return false;
    }

    constructor(private _runtimeScript: IRuntimeScript, private _authoredPath: string) {

    }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._authoredPath;
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

    constructor(private _runtimeScript: IRuntimeScript) { }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._runtimeScript.url;
    }
}

export class DynamicRuntimeScript implements IRuntimeScriptSource {
    public isRuntimeScriptSource(): boolean {
        return true;
    }

    constructor(private _runtimeScript: IRuntimeScript) { }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._runtimeScript.url;
    }
}

export class RuntimeScriptWithSourceOnWorkspace implements IRuntimeScriptSource {
    public isRuntimeScriptSource(): boolean {
        return true;
    }

    constructor(private _runtimeScript: IRuntimeScript, private _locationInWorkspace: string) {

    }

    public get runtimeScript(): IRuntimeScript {
        return this._runtimeScript;
    }

    public get path(): string {
        return this._locationInWorkspace;
    }
}
