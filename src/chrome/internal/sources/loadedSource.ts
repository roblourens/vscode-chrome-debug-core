import { IScript } from '../scripts/script';
import { CDTPScriptUrl } from './resourceIdentifierSubtypes';
import { IResourceIdentifier, parseResourceIdentifier, ResourceName } from './resourceIdentifier';

export interface ILoadedSource<TString = string> {
    readonly script: IScript;
    readonly identifier: IResourceIdentifier<TString>;
    readonly origin: string;
    doesScriptHasUrl(): boolean; // TODO DIEGO: Figure out if we can delete this property
    isSourceOfCompiled(): boolean;
}

/**
 * Loaded Source classification:
 * Is the script content available on a single place, or two places? (e.g.: You can find similar scripts in multiple different paths)
 *  1. Single: Is the single place on storage, or is this a dynamic script?
 *      Single path on storage: RuntimeScriptRunFromStorage
 *      Single path not on storage: DynamicRuntimeScript
 *  2. Two: We assume one path is from the webserver, and the other path is in the workspace: RuntimeScriptWithSourceOnWorkspace
 */

abstract class LoadedSourceCommonLogic<TSource = string> implements ILoadedSource<TSource> {
    public abstract get origin(): string;
    protected abstract get _identifier(): IResourceIdentifier<TSource>;
    protected abstract get _script(): IScript;

    public isSourceOfCompiled(): boolean {
        return false;
    }

    public doesScriptHasUrl(): boolean {
        return true;
    }

    public get identifier(): IResourceIdentifier<TSource> {
        return this._identifier;
    }

    public get script(): IScript {
        return this._script;
    }
}

abstract class LoadedSourceWithURLCommonLogic<TSource = string> extends LoadedSourceCommonLogic<TSource> {
    public toString(): string {
        return `src:${this.identifier}`;
    }

    constructor(protected readonly _script: IScript, protected _identifier: IResourceIdentifier<TSource>, public readonly origin: string) {
        super();
    }
}

export class ScriptRunFromLocalStorage extends LoadedSourceWithURLCommonLogic<CDTPScriptUrl> implements ILoadedSource<CDTPScriptUrl> { }
export class DynamicScript extends LoadedSourceWithURLCommonLogic<CDTPScriptUrl> implements ILoadedSource<CDTPScriptUrl> { }
export class ScriptRuntimeSource extends LoadedSourceWithURLCommonLogic<CDTPScriptUrl> implements ILoadedSource<CDTPScriptUrl> { }
export class ScriptDevelopmentSource extends LoadedSourceWithURLCommonLogic implements ILoadedSource { }

export class NoURLScriptSource extends LoadedSourceCommonLogic<CDTPScriptUrl> implements ILoadedSource<CDTPScriptUrl> {
    protected get _identifier(): IResourceIdentifier<CDTPScriptUrl> {
        return parseResourceIdentifier<CDTPScriptUrl>(`${NoURLScriptSource.EVAL_PSEUDO_PREFIX}${this._name.textRepresentation}` as any);
    }

    // TODO DIEGO: Move these two properties to the client layer
    public static EVAL_FILENAME_PREFIX = 'VM';
    public static EVAL_PSEUDO_FOLDER = '<eval>';
    public static EVAL_PSEUDO_PREFIX = `${NoURLScriptSource.EVAL_PSEUDO_FOLDER}\\${NoURLScriptSource.EVAL_FILENAME_PREFIX}`;

    public doesScriptHasUrl(): boolean {
        return false;
    }

    public toString(): string {
        return `No URL script source with id: ${this._name}`;
    }

    constructor(protected readonly _script: IScript, protected _name: ResourceName<CDTPScriptUrl>, public readonly origin: string) {
        super();
    }
}

// This represents a path to a development source that was compiled to generate the runtime code of the script
export class SourceOfCompiled extends LoadedSourceWithURLCommonLogic implements ILoadedSource {
    public isSourceOfCompiled(): boolean {
        return true;
    }
}

export interface ILoadedSourceTreeNode {
    readonly mainSource: ILoadedSource;
    readonly relatedSources: ILoadedSourceTreeNode[];
}

function determineOrderingOfStrings(left: string, right: string): number {
    if (left < right) {
        return -1;
    } else if (left > right) {
        return 1;
    } else {
        return 0;
    }
}

export function determineOrderingOfLoadedSources(left: ILoadedSource, right: ILoadedSource): number {
    return determineOrderingOfStrings(left.identifier.canonicalized, right.identifier.canonicalized);
}