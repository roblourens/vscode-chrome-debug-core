import { SourceTextLogic, SourceTextLogicDependencies } from './sourcesTextLogic';
import { SourcesTreeNodeLogic, SourcesTreeNodeLogicDependencies } from './sourcesTreeNodeLogic';
import { SourceResolverLogic, SourceResolverLogicDependencies } from './sourceResolverLogic';
import { ILoadedSource, ILoadedSourceTreeNode } from './loadedSource';
import { ISourceResolver } from './sourceResolver';
import { IScript } from '../scripts/script';
import { IResourceIdentifier } from './resourceIdentifier';
import { IFeature } from '../features/feature';

export interface SourcesLogicDependencies extends SourceResolverLogicDependencies, SourceTextLogicDependencies, SourcesTreeNodeLogicDependencies {
}

export class SourcesLogic implements IFeature {
    private readonly _sourceResolverLogic = new SourceResolverLogic(this._dependencies);
    private readonly _sourceTextLogic = new SourceTextLogic(this._dependencies);
    private readonly _sourceTreeNodeLogic = new SourcesTreeNodeLogic(this._dependencies);

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

    public async install(): Promise<this> {
        await this._sourceResolverLogic.install();
        await this._sourceTextLogic.install();
        await this._sourceTreeNodeLogic.install();
        return this;
    }

    constructor(private readonly _dependencies: SourcesLogicDependencies) { }
}