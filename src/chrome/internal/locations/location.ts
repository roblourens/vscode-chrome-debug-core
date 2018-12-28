import * as Validation from '../../../validation';
import { IScript } from '../scripts/script';
import { IUnresolvedSource } from '../sources/unresolvedSource';
import { ILoadedSource } from '../sources/loadedSource';
import { URLRegexp } from '../breakpoints/bpRecipie';
import { CDTPScriptUrl } from '../sources/resourceIdentifierSubtypes';
import { logger } from 'vscode-debugadapter';
import { ColumnNumber, LineNumber } from './subtypes';
import { IResourceIdentifier, parseResourceIdentifier } from '../sources/resourceIdentifier';

export type integer = number;

export class Coordinates {
    public isSameAs(location: Coordinates): boolean {
        return this.lineNumber === location.lineNumber
            && this.columnNumber === location.columnNumber;
    }

    public toString(): string {
        return this.columnNumber !== undefined
            ? `${this.lineNumber}:${this.columnNumber}`
            : `${this.lineNumber}`;
    }

    constructor(
        public readonly lineNumber: LineNumber,
        public readonly columnNumber?: ColumnNumber) {
        Validation.zeroOrPositive('Line number', lineNumber);
        if (columnNumber !== undefined) {
            Validation.zeroOrPositive('Column number', columnNumber);
        }
    }
}

export type ScriptOrLoadedSource = IScript | ILoadedSource;
export type ScriptOrSource = ScriptOrLoadedSource | IUnresolvedSource;
export type ScriptOrSourceOrUrlRegexp = ScriptOrSource | IResourceIdentifier | URLRegexp | IResourceIdentifier<CDTPScriptUrl>;

interface ILocation<T extends ScriptOrSourceOrUrlRegexp> {
    readonly lineNumber: integer;
    readonly columnNumber?: integer;
    readonly coordinates: Coordinates;
    readonly resource: T;
}

export type Location<T extends ScriptOrSourceOrUrlRegexp> =
    T extends IScript ? LocationInScript :
    T extends IUnresolvedSource ? LocationInUnresolvedSource :
    T extends ILoadedSource ? LocationInLoadedSource :
    T extends IResourceIdentifier ? ILocation<IResourceIdentifier> :
    T extends IResourceIdentifier<CDTPScriptUrl> ? ILocation<IResourceIdentifier<CDTPScriptUrl>> :
    T extends URLRegexp ? ILocation<URLRegexp> :
    never;

abstract class LocationCommonLogic<T extends ScriptOrSourceOrUrlRegexp> implements ILocation<T> {
    public get lineNumber(): LineNumber {
        return this.coordinates.lineNumber;
    }

    public get columnNumber(): ColumnNumber {
        return this.coordinates.columnNumber;
    }

    public toString(): string {
        return `${this.resource}:${this.coordinates}`;
    }

    constructor(
        public readonly resource: T,
        public readonly coordinates: Coordinates) { }
}

export class LocationInUnresolvedSource extends LocationCommonLogic<IUnresolvedSource> implements ILocation<IUnresolvedSource> {
    public tryResolving<R>(
        succesfulAction: (locationInLoadedSource: Location<ILoadedSource>) => R,
        failedAction: (locationInUnbindedSource: LocationInUnresolvedSource) => R): R {
        return this.resource.tryResolving(
            loadedSource => succesfulAction(new LocationInLoadedSource(loadedSource, this.coordinates)),
            () => failedAction(this));
    }

    public resolvedWith(loadedSource: ILoadedSource): LocationInLoadedSource {
        if (this.resource.sourceIdentifier.isEquivalent(loadedSource.identifier)) {
            return new LocationInLoadedSource(loadedSource, this.coordinates);
        } else {
            throw new Error(`Can't convert a location with an unbinded source (${this}) to a location with a loaded source that doesn't match the unbinded source: ${loadedSource}`);
        }
    }
}

interface IBindedLocation<T extends ScriptOrSourceOrUrlRegexp> extends ILocation<T> {
    mappedToSource(): LocationInLoadedSource;
    mappedToScript(): LocationInScript;
}

export class LocationInScript extends LocationCommonLogic<IScript> implements IBindedLocation<IScript> {
    public get script(): IScript {
        return this.resource;
    }

    public mappedToSource(): LocationInLoadedSource {
        const mapped = this.script.sourcesMapper.getPositionInSource({ line: this.lineNumber, column: this.columnNumber });
        if (mapped) {
            const loadedSource = this.script.getSource(parseResourceIdentifier(mapped.source));
            const result = new LocationInLoadedSource(loadedSource, new Coordinates(mapped.line, mapped.column));
            logger.verbose(`SourceMap: ${this} to ${result}`);
            return result;
        } else {
            return new LocationInLoadedSource(this.script.developmentSource, this.coordinates);
        }
    }

    public mappedToScript(): LocationInScript {
        return this;
    }

    public mappedToUrl(): LocationInUrl {
        if (this.script.runtimeSource.doesScriptHasUrl()) {
            return new LocationInUrl(this.script.runtimeSource.identifier, this.coordinates);
        } else {
            throw new Error(`Can't convert a location in a script without an URL (${this}) into a location in a URL`);
        }
    }

    public isSameAs(locationInScript: LocationInScript): boolean {
        return this.script === locationInScript.script &&
            this.coordinates.isSameAs(locationInScript.coordinates);
    }

    public toString(): string {
        return `${this.resource.runtimeSource}:${this.coordinates}`;
    }
}

export class LocationInLoadedSource extends LocationCommonLogic<ILoadedSource> implements IBindedLocation<ILoadedSource> {
    public get source(): ILoadedSource {
        return this.resource;
    }

    public mappedToSource(): LocationInLoadedSource {
        return this;
    }

    public mappedToScript(): LocationInScript {
        const mapped = this.source.script.sourcesMapper.getPositionInScript({
            source: this.source.identifier.textRepresentation,
            line: this.lineNumber,
            column: this.columnNumber
        });
        if (mapped) {
            const result = new LocationInScript(this.source.script, new Coordinates(mapped.line, mapped.column));
            logger.verbose(`SourceMap: ${this} to ${result}`);
            return result;
        } else {
            throw new Error(`Couldn't map the location (${this.coordinates}) in the source $(${this.source}) to a script file`);
        }
    }
}

export class LocationInUrl extends LocationCommonLogic<IResourceIdentifier<CDTPScriptUrl>> implements ILocation<IResourceIdentifier<CDTPScriptUrl>> {
    public get url(): IResourceIdentifier<CDTPScriptUrl> {
        return this.resource;
    }

    public get source(): never {
        throw new Error(`LocationInUrl doesn't support the source property`);
    }
}

export class LocationInUrlRegexp extends LocationCommonLogic<URLRegexp> implements ILocation<URLRegexp> {
    public get urlRegexp(): URLRegexp {
        return this.resource;
    }

    public get source(): never {
        throw new Error(`LocationInUrlRegexp doesn't support the source property`);
    }
}
