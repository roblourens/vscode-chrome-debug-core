import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { IResourceIdentifier, newResourceIdentifierMap } from '../resourceIdentifier';
import { ILoadedSource } from '../loadedSource';
import { ISourceIdentifier, SourceIdentifiedByPath, SourceIdentifiedByLoadedSource } from '../sourceIdentifier';

export class SourcesIdentifierLogic {
    private _pathToSource = newResourceIdentifierMap<ILoadedSource>();

    public tryGettingLoadedSourceByPath<R>(identifier: IResourceIdentifier,
        whenSuccesfulDo: (loadedSource: ILoadedSource) => R,
        whenFailedDo: (identifier: IResourceIdentifier) => R = path => { throw new Error(`Couldn't find the runtime script source at path ${path}`); }): R {
        const source = this._pathToSource.tryGetting(identifier);
        if (source !== undefined) {
            return whenSuccesfulDo(source);
        } else {
            return whenFailedDo(identifier);
        }
    }

    public createSourceIdentifier(identifier: IResourceIdentifier): ISourceIdentifier {
        return this.tryGettingLoadedSourceByPath<ISourceIdentifier>(identifier,
            loadedSource => new SourceIdentifiedByLoadedSource(loadedSource),
            () => new SourceIdentifiedByPath(identifier, this));
    }

    constructor(private readonly _chromeDiagnostics: CDTPDiagnostics) {
        this._chromeDiagnostics.Debugger.onScriptParsed((params) => {
            params.script.allSources.forEach(source => {
                this._pathToSource.set(source.identifier, source);
            });
        });
    }
}