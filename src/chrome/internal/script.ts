import { IResourceIdentifier, IResourceLocation, ResourceName, parseResourceIdentifier, newResourceIdentifierMap } from '../internal/resourceIdentifier';
import * as fs from 'fs';
import { ISourcesMapper, NoSourceMapping } from '../internal/sourcesMapper';
import { ILoadedSource, SourceOfCompiled, ScriptRunFromLocalStorage, DynamicScript, ScriptRuntimeSource, ScriptDevelopmentSource, NoURLScriptSource } from './loadedSource';
import { CDTPScriptUrl } from './resourceIdentifierSubtypes';
import { ValidatedMap } from '../collections/validatedMap';

export interface IScript {
    runtimeSource: ILoadedSource<CDTPScriptUrl>; // Source in Webserver
    developmentSource: ILoadedSource; // Source in Workspace
    sourcesOfCompiled: SourceOfCompiled[]; // Sources before compilation
    allSources: ILoadedSource[]; // runtimeSource + developmentSource + sourcesOfCompiled
    url: CDTPScriptUrl;

    sourcesMapper: ISourcesMapper; // TODO DIEGO: See if we can delete this property

    getSource(sourceIdentifier: IResourceIdentifier): ILoadedSource;
}

export class Script implements IScript {
    private readonly _runtimeSource: ILoadedSource<CDTPScriptUrl>;
    private readonly _developmentSource: ILoadedSource;
    private readonly _compiledSources: ValidatedMap<IResourceIdentifier, SourceOfCompiled>;

    public static create(locationInRuntimeEnvironment: IResourceLocation<CDTPScriptUrl>, locationInDevelopmentEnvinronment: IResourceLocation,
        sourcesMapper: ISourcesMapper): Script {
        const sourcesOfCompiled = (script: IScript) => newResourceIdentifierMap<SourceOfCompiled>(sourcesMapper.sources.map(path => {
            const identifier = parseResourceIdentifier(path);
            return [identifier, new SourceOfCompiled(script, identifier, 'TODO DIEGO')] as [IResourceIdentifier, SourceOfCompiled];
        }));

        /**
         * Loaded Source classification:
         * Is the script content available on a single place, or two places? (e.g.: You can find similar scripts in multiple different paths)
         *  1. Single: Is the single place on the user workspace, or is this a dynamic script?
         *      Single path on storage: RuntimeScriptRunFromStorage
         *      Single path not on storage: DynamicRuntimeScript
         *  2. Two: We assume one path is from the webserver, and the other path is in the workspace: RuntimeScriptWithSourceOnWorkspace
         */
        let runtimeSource: (script: IScript) => ILoadedSource<CDTPScriptUrl>;
        let developmentSource: (script: IScript) => ILoadedSource;
        if (locationInRuntimeEnvironment.isEquivalent(locationInDevelopmentEnvinronment)) {
            if (fs.existsSync(locationInRuntimeEnvironment.textRepresentation)) {
                developmentSource = runtimeSource = script => new ScriptRunFromLocalStorage(script, locationInRuntimeEnvironment, 'TODO DIEGO');
            } else {
                developmentSource = runtimeSource = script => new DynamicScript(script, locationInRuntimeEnvironment, 'TODO DIEGO');
            }
        } else {
            // The script is served from one location, and it's on the workspace on a different location
            runtimeSource = script => new ScriptRuntimeSource(script, locationInRuntimeEnvironment, 'TODO DIEGO');
            developmentSource = script => new ScriptDevelopmentSource(script, locationInDevelopmentEnvinronment, 'TODO DIEGO');
        }
        return new Script(runtimeSource, developmentSource, sourcesOfCompiled, sourcesMapper);
    }

    public static createEval(name: ResourceName<CDTPScriptUrl>): Script {
        // TODO DIEGO Return the same instance both functions
        const getNoURLScript = (script: IScript) => new NoURLScriptSource(script, name, 'TODO DIEGO');
        return new Script(getNoURLScript, getNoURLScript, _ => new Map<IResourceIdentifier, SourceOfCompiled>(), new NoSourceMapping());
    }

    constructor(getRuntimeSource: (script: IScript) => ILoadedSource<CDTPScriptUrl>, getDevelopmentSource: (script: IScript) => ILoadedSource,
        getCompiledScriptSources: (script: IScript) => Map<IResourceIdentifier, SourceOfCompiled>, public readonly sourcesMapper: ISourcesMapper) {
        this._runtimeSource = getRuntimeSource(this);
        this._developmentSource = getDevelopmentSource(this);
        this._compiledSources = new ValidatedMap(getCompiledScriptSources(this));
    }

    public get developmentSource(): ILoadedSource {
        return this._developmentSource;
    }

    public get runtimeSource(): ILoadedSource<CDTPScriptUrl> {
        return this._runtimeSource;
    }

    public get sourcesOfCompiled(): SourceOfCompiled[] {
        return Array.from(this._compiledSources.values());
    }

    public getSource(sourceIdentifier: IResourceIdentifier): ILoadedSource {
        return this._compiledSources.get(sourceIdentifier);
    }

    public get allSources(): ILoadedSource[] {
        const unmappedSources: ILoadedSource[] = [this.runtimeSource];
        if (this.developmentSource !== this.runtimeSource) {
            unmappedSources.push(this.developmentSource);
        }

        return unmappedSources.concat(this.sourcesOfCompiled);
    }

    public get url(): CDTPScriptUrl {
        return this._runtimeSource.identifier.textRepresentation;
    }
}
