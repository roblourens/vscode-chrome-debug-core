import { IResourceIdentifier } from './resourceIdentifier';
import { ILoadedSource } from './loadedSource';
import { SourceResolver } from './sourceResolver';

export interface IUnresolvedSource {
    readonly sourceIdentifier: IResourceIdentifier;
    isEquivalent(right: IUnresolvedSource): boolean;
    tryResolving<R>(succesfulAction: (resolvedSource: ILoadedSource) => R, failedAction: (sourceIdentifier: IResourceIdentifier) => R): R;
}

abstract class UnresolvedSourceCommonLogic implements IUnresolvedSource {
    public abstract tryResolving<R>(succesfulAction: (loadedSource: ILoadedSource) => R, failedAction: (identifier: IResourceIdentifier) => R): R;
    public abstract get sourceIdentifier(): IResourceIdentifier;

    public isEquivalent(right: IUnresolvedSource): boolean {
        return this.sourceIdentifier.isEquivalent(right.sourceIdentifier);
    }
}

// Find the source to resolve to by using the path
export class SourceToBeResolvedViaPath extends UnresolvedSourceCommonLogic implements IUnresolvedSource {
    public tryResolving<R>(succesfulAction: (resolvedSource: ILoadedSource) => R, failedAction: (sourceIdentifier: IResourceIdentifier) => R) {
        return this._sourceResolver.tryResolving(this.sourceIdentifier, succesfulAction, failedAction);
    }

    public toString(): string {
        return `Resolve source using #${this.sourceIdentifier}`;
    }

    constructor(public readonly sourceIdentifier: IResourceIdentifier, private readonly _sourceResolver: SourceResolver) {
        super();
    }
}

export class SourceAlreadyResolvedToLoadedSource extends UnresolvedSourceCommonLogic implements IUnresolvedSource {
    public tryResolving<R>(succesfulAction: (resolvedSource: ILoadedSource) => R, _failedAction: (sourceIdentifier: IResourceIdentifier) => R) {
        return succesfulAction(this.loadedSource);
    }

    public get sourceIdentifier(): IResourceIdentifier {
        return this.loadedSource.identifier;
    }

    public toString(): string {
        return `${this.loadedSource}`;
    }

    constructor(public readonly loadedSource: ILoadedSource) {
        super();
    }
}
