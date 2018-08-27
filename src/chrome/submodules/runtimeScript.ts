import { IRuntimeScriptSource, RuntimeScriptRunFromStorage, DynamicRuntimeScript, RuntimeScriptWithSourceOnWorkspace, AuthoredSourceOfRuntimeScript } from './loadedSource';
import { IResourceLocationOrName, isEquivalentPath, parseResourceLocationOrName } from './resourceLocation';
import * as fs from 'fs';

export interface IRuntimeScript {
    url: string; // url or name
    mappedUrl: string;
    sources: AuthoredSourceOfRuntimeScript[];
    runtimeSource: IRuntimeScriptSource;
}

export class RuntimeScript implements IRuntimeScript {
    private readonly _loadedSource: IRuntimeScriptSource;
    private readonly _nameOrLocationOnWebServer: IResourceLocationOrName;
    private readonly _authoredSources: AuthoredSourceOfRuntimeScript[];

    constructor(nameOrLocationOnWebServer: string, locationInWorkspace: string, sourceNamesOrLocations: string[]) {
        this._nameOrLocationOnWebServer = parseResourceLocationOrName(nameOrLocationOnWebServer);
        this._authoredSources = sourceNamesOrLocations.map(path => new AuthoredSourceOfRuntimeScript(this, path));

        /**
         * Loaded Source classification:
         * Is the script content available on a single place, or two places? (e.g.: You can find similar scripts in multiple different paths)
         *  1. Single: Is the single place on the user workspace, or is this a dynamic script?
         *      Single path on storage: RuntimeScriptRunFromStorage
         *      Single path not on storage: DynamicRuntimeScript
         *  2. Two: We assume one path is from the webserver, and the other path is in the workspace: RuntimeScriptWithSourceOnWorkspace
         */
        if (isEquivalentPath(nameOrLocationOnWebServer, locationInWorkspace)) {
            if (fs.existsSync(locationInWorkspace)) {
                this._loadedSource = new RuntimeScriptRunFromStorage(this);
            } else {
                this._loadedSource = new DynamicRuntimeScript(this);
            }
        } else {
            // The script is served from one location, and it's on the workspace on a different location
            this._loadedSource = new RuntimeScriptWithSourceOnWorkspace(this, locationInWorkspace);
        }
    }

    public get url(): string {
        return this._nameOrLocationOnWebServer.textRepresentation;
    }

    public get mappedUrl(): string {
        return this._loadedSource.path;
    }

    public get sources(): AuthoredSourceOfRuntimeScript[] {
        return this._authoredSources;
    }

    public get runtimeSource(): IRuntimeScriptSource {
        return this._loadedSource;
    }
}