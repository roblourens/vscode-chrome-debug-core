import { SourceTextLogic } from './sourcesTextLogic';
import { SourcesTreeNodeLogic } from './sourcesTreeNodeLogic';
import { SourceResolverLogic } from './sourceResolverLogic';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { ScriptsRegistry } from '../scripts/scriptsRegistry';
import { ILoadedSource, ILoadedSourceTreeNode } from './loadedSource';
import { ISourceResolver } from './sourceResolver';
import { IScript } from '../scripts/script';
import { IResourceIdentifier } from './resourceIdentifier';

export class SourcesLogic {
    private readonly _sourceResolverLogic: SourceResolverLogic;
    private readonly _sourceTextLogic: SourceTextLogic;
    private readonly _sourceTreeNodeLogic: SourcesTreeNodeLogic;

    public tryResolving<R>(sourceIdentifier: IResourceIdentifier,
        ifSuccesfulDo: (resolvedSource: ILoadedSource) => R,
        ifFailedDo?: (sourceIdentifier: IResourceIdentifier) => R): R {
        return this._sourceResolverLogic.tryResolving(sourceIdentifier, ifSuccesfulDo, ifFailedDo);
    }

    public createSourceResolver(sourceIdentifier: IResourceIdentifier): ISourceResolver {
        return this._sourceResolverLogic.createSourceResolver(sourceIdentifier);
    }

    public async getLoadedSourcesTrees(): Promise<ILoadedSourceTreeNode[]> {
        return this._sourceTreeNodeLogic.getLoadedSourcesTrees();
    }

    public getLoadedSourcesTreeForScript(script: IScript): ILoadedSourceTreeNode {
        return this._sourceTreeNodeLogic.getLoadedSourcesTreeForScript(script);
    }

    public async getScriptText(script: IScript): Promise<string> {
        return await this._sourceTextLogic.text(script.runtimeSource);
    }

    public async getText(source: ISourceResolver): Promise<string> {
        return await source.tryResolving(
            async loadedSource => await this._sourceTextLogic.text(loadedSource),
            identifier => {
                throw new Error(`Couldn't resolve the source with the path: ${identifier.textRepresentation}`);
            });
    }

    public toString(): string {
        return `Sources logic {\nResolver:\n${this._sourceResolverLogic}\n` +
            `Text:\n${this._sourceTextLogic}\nTree node:\n${this._sourceTreeNodeLogic}\n}`;
    }

    constructor(
        chromeDiagnostics: CDTPDiagnostics,
        scriptsLogic: ScriptsRegistry) {
        this._sourceResolverLogic = new SourceResolverLogic(chromeDiagnostics);
        this._sourceTextLogic = new SourceTextLogic(chromeDiagnostics);
        this._sourceTreeNodeLogic = new SourcesTreeNodeLogic(scriptsLogic);
    }
}