import { SourcesTextLogic } from './sourcesTextLogic';
import { SourcesTreeNodeLogic } from './sourcesTreeNodeLogic';
import { SourcesIdentifierLogic } from './sourcesIdentifierLogic';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { RuntimeScriptsManager } from '../../target/runtimeScriptsManager';
import { IResourceIdentifier } from '../resourceIdentifier';
import { ILoadedSource, ILoadedSourceTreeNode } from '../loadedSource';
import { ISourceIdentifier } from '../sourceIdentifier';
import { IScript } from '../script';

export class SourcesLogic {
    private readonly _sourceIdentifierLogic: SourcesIdentifierLogic;
    private readonly _sourceTextLogic: SourcesTextLogic;
    private readonly _sourceTreeNodeLogic: SourcesTreeNodeLogic;

    public tryGettingLoadedSourceByPath<R>(identifier: IResourceIdentifier,
        ifSuccesfulDo: (loadedSource: ILoadedSource) => R,
        ifFailedDo?: (identifier: IResourceIdentifier) => R): R {
        return this._sourceIdentifierLogic.tryGettingLoadedSourceByPath(identifier, ifSuccesfulDo, ifFailedDo);
    }

    public createSourceIdentifier(identifier: IResourceIdentifier): ISourceIdentifier {
        return this._sourceIdentifierLogic.createSourceIdentifier(identifier);
    }

    public async text(loadedSource: ILoadedSource): Promise<string> {
        return this._sourceTextLogic.text(loadedSource);
    }

    public async getLoadedSourcesTrees(): Promise<ILoadedSourceTreeNode[]> {
        return this._sourceTreeNodeLogic.getLoadedSourcesTrees();
    }

    public getLoadedSourcesTree(script: IScript): ILoadedSourceTreeNode {
        return this._sourceTreeNodeLogic.getLoadedSourcesTree(script);
    }

    public async getText(source: ISourceIdentifier): Promise<string> {
        return await source.tryGettingLoadedSource(
            async loadedSource => await this.text(loadedSource),
            identifier => {
                throw new Error(`Couldn't find an already loaded source with path ${identifier.textRepresentation}`);
            });
    }

    public toString(): string {
        return `Sources logic\nSource identifier logic: ${this._sourceIdentifierLogic}\n` +
            `Source text logic: ${this._sourceTextLogic}\nSource tree node logic: ${this._sourceTreeNodeLogic}`;
    }

    constructor(chromeDiagnostics: CDTPDiagnostics, scriptsLogic: RuntimeScriptsManager) {
        this._sourceIdentifierLogic = new SourcesIdentifierLogic(chromeDiagnostics);
        this._sourceTextLogic = new SourcesTextLogic(chromeDiagnostics);
        this._sourceTreeNodeLogic = new SourcesTreeNodeLogic(scriptsLogic);
    }
}