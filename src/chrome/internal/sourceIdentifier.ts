import { IResourceIdentifier } from './resourceIdentifier';
import { ILoadedSource } from './loadedSource';
import { SourcesIdentifierLogic } from './sources/sourcesIdentifierLogic';

export interface IRequestedSourceIdentifier {
    identifier: IResourceIdentifier;
    isSameSource(right: IRequestedSourceIdentifier): boolean;
    tryGettingLoadedSource<R>(whenSuccesfulDo: (loadedSource: ILoadedSource) => R, whenFailedDo: (identifier: IResourceIdentifier) => R): R;
}

abstract class IsSameSourceCommonLogic implements IRequestedSourceIdentifier {
    public abstract tryGettingLoadedSource<R>(whenSuccesfulDo: (loadedSource: ILoadedSource) => R, whenFailedDo: (identifier: IResourceIdentifier) => R): R;
    public abstract get identifier(): IResourceIdentifier;

    public isSameSource(right: IRequestedSourceIdentifier): boolean {
        return this.identifier.isEquivalent(right.identifier);
    }
}

// This represents a path where we can find the source
export class SourceIdentifiedByPath extends IsSameSourceCommonLogic implements IRequestedSourceIdentifier {
    private _loadedSource: ILoadedSource | null = null;

    public tryGettingLoadedSource<R>(whenSuccesfulDo: (loadedSource: ILoadedSource) => R, whenFailedDo: (identifier: IResourceIdentifier) => R) {
        if (!this._loadedSource) {
            this._sourceManager.tryGettingLoadedSourceByPath(this.identifier, loadedSource => this._loadedSource = loadedSource, () => { });
        }

        if (this._loadedSource) {
            return whenSuccesfulDo(this._loadedSource);
        } else {
            return whenFailedDo(this.identifier);
        }
    }

    public toString(): string {
        return `Source identify by path ${this.identifier}. Laoded source: ${this._loadedSource}`;
    }

    constructor(public readonly identifier: IResourceIdentifier, private readonly _sourceManager: SourcesIdentifierLogic) {
        super();
    }
}

export class SourceIdentifiedByLoadedSource extends IsSameSourceCommonLogic implements IRequestedSourceIdentifier {
    public tryGettingLoadedSource<R>(whenSuccesfulDo: (loadedSource: ILoadedSource) => R, _whenFailedDo: (identifier: IResourceIdentifier) => R) {
        return whenSuccesfulDo(this.loadedSource);
    }

    public get identifier(): IResourceIdentifier {
        return this.loadedSource.identifier;
    }

    public toString(): string {
        return `Source identify by loaded source ${this.loadedSource}`;
    }

    constructor(public readonly loadedSource: ILoadedSource) {
        super();
    }
}
