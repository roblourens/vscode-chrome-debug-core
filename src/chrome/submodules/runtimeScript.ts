import { IRuntimeScriptSource, RuntimeScriptRunFromStorage, DynamicRuntimeScript, RuntimeScriptWithSourceInDevelopmentEnvironment, DevelopmentSourceOfRuntimeScript } from './loadedSource';
import { IResourceIdentifier, IResourceLocation } from './resourceIdentifier';
import * as fs from 'fs';

export interface IRuntimeScript {
    url: string; // url or name
    mappedUrl: string;
    sources: DevelopmentSourceOfRuntimeScript[];
    runtimeSource: IRuntimeScriptSource;
}

export class RuntimeScript implements IRuntimeScript {
    private readonly _loadedSource: IRuntimeScriptSource;
    private readonly _authoredSources: DevelopmentSourceOfRuntimeScript[];

    constructor(locationInRuntimeEnvironment: IResourceLocation, locationInDevelopmentEnvinronment: IResourceLocation, developmentSourcesIdentifier: IResourceIdentifier[]) {
        this._authoredSources = developmentSourcesIdentifier.map(path => new DevelopmentSourceOfRuntimeScript(this, path));

        /**
         * Loaded Source classification:
         * Is the script content available on a single place, or two places? (e.g.: You can find similar scripts in multiple different paths)
         *  1. Single: Is the single place on the user workspace, or is this a dynamic script?
         *      Single path on storage: RuntimeScriptRunFromStorage
         *      Single path not on storage: DynamicRuntimeScript
         *  2. Two: We assume one path is from the webserver, and the other path is in the workspace: RuntimeScriptWithSourceOnWorkspace
         */
        if (locationInRuntimeEnvironment.isEquivalent(locationInDevelopmentEnvinronment)) {
            if (fs.existsSync(locationInDevelopmentEnvinronment.textRepresentation)) {
                this._loadedSource = new RuntimeScriptRunFromStorage(this, locationInRuntimeEnvironment);
            } else {
                this._loadedSource = new DynamicRuntimeScript(this, locationInRuntimeEnvironment);
            }
        } else {
            // The script is served from one location, and it's on the workspace on a different location
            this._loadedSource = new RuntimeScriptWithSourceInDevelopmentEnvironment(this, locationInRuntimeEnvironment, locationInDevelopmentEnvinronment);
        }
    }

    public get url(): string {
        return this._loadedSource.path;
    }

    public get mappedUrl(): string {
        return this._loadedSource.path;
    }

    public get sources(): DevelopmentSourceOfRuntimeScript[] {
        return this._authoredSources;
    }

    public get runtimeSource(): IRuntimeScriptSource {
        return this._loadedSource;
    }
}