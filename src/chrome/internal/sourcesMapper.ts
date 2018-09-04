import { SourceMap } from '../../sourceMaps/sourceMap';

export interface ISourcesMapper {
    readonly sources: string[];
    getSourceLocation(scriptLocation: IPositionInScript): IPositionInSource | null;
    getScriptLocation(scriptLocation: IPositionInSource): IPositionInScript | null;
}

interface IPositionInSource {
    readonly source: string;
    readonly line: number;
    readonly column?: number;
}

interface IPositionInScript {
    readonly line: number;
    readonly column?: number;
}

export class SourcesMapper implements ISourcesMapper {
    public getSourceLocation(scriptLocation: IPositionInScript): IPositionInSource | null {
        const { source, line, column } = this._sourceMap.authoredPositionFor(scriptLocation.line, scriptLocation.column || 0);
        return source && line ? { source, line, column } : null;
    }

    public getScriptLocation(sourcePosition: IPositionInSource): IPositionInScript | null {
        const { line, column } = this._sourceMap.generatedPositionFor(sourcePosition.source,
            sourcePosition.line, sourcePosition.column || 0);
        return line ? { line, column } : null;
    }

    public get sources(): string[] {
        return this._sourceMap.authoredSources || [];
    }

    constructor(private readonly _sourceMap: SourceMap) { }

}

export class NoSourceMapping implements ISourcesMapper {
    public getSourceLocation(_: IPositionInScript): null {
        return null;
    }

    public getScriptLocation(_: IPositionInSource): null {
        return null;
    }

    public get sources(): [] {
        return [];
    }
}