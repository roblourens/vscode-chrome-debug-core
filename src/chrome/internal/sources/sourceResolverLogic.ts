import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { ILoadedSource } from './loadedSource';
import { ISourceResolver, ResolveSourceUsingPath } from './sourceResolver';
import { newResourceIdentifierMap, IResourceIdentifier } from './resourceIdentifier';

export class SourceResolverLogic {
    private _pathToSource = newResourceIdentifierMap<ILoadedSource>();

    public tryResolving<R>(sourceIdentifier: IResourceIdentifier,
        whenSuccesfulDo: (resolvedSource: ILoadedSource) => R,
        whenFailedDo: (sourceIdentifier: IResourceIdentifier) => R = path => { throw new Error(`Couldn't find the source at path ${path}`); }): R {
        const source = this._pathToSource.tryGetting(sourceIdentifier);
        if (source !== undefined) {
            return whenSuccesfulDo(source);
        } else {
            return whenFailedDo(sourceIdentifier);
        }
    }

    public createSourceResolver(sourceIdentifier: IResourceIdentifier): ISourceResolver {
        return new ResolveSourceUsingPath(sourceIdentifier, this);
    }

    public toString(): string {
        return `Source resolver logic { path to source: ${this._pathToSource} }`;
    }

    constructor(private readonly _chromeDiagnostics: CDTPDiagnostics) {
        this._chromeDiagnostics.Debugger.onScriptParsed((params) => {
            params.script.allSources.forEach(source => {
                this._pathToSource.set(source.identifier, source);
            });
        });
    }
}