import * as Validation from '../../../validation';
import { IScript } from '../scripts/script';
import { ISourceResolver } from '../sources/sourceResolver';
import { ILoadedSource } from '../sources/loadedSource';
import { URLRegexp } from '../breakpoints/bpRecipie';
import { CDTPScriptUrl } from '../sources/resourceIdentifierSubtypes';
import { logger } from 'vscode-debugadapter';
import { ColumnNumber, LineNumber } from './subtypes';
import { IResourceIdentifier, parseResourceIdentifier } from '../sources/resourceIdentifier';

export type integer = number;

export class ZeroBasedLocation {
    public toString(): string {
        return this.columnNumber !== undefined
            ? `${this.lineNumber}:${this.columnNumber}`
            : `${this.lineNumber}`;
    }

    public isSameAs(location: ZeroBasedLocation): boolean {
        return this.lineNumber === location.lineNumber
        && this.columnNumber === location.columnNumber;
    }

    constructor(
        public readonly lineNumber: LineNumber,
        public readonly columnNumber?: ColumnNumber) {
        Validation.zeroOrPositive('Line number', lineNumber);
        if (columnNumber !== undefined && columnNumber !== null) {
            Validation.zeroOrPositive('Column number', columnNumber);
        }
    }
}

export type ScriptOrSource = IScript | ILoadedSource;
export type ScriptOrSourceOrIdentifier = ScriptOrSource | ISourceResolver;
export type ScriptOrSourceOrIdentifierOrUrlRegexp = ScriptOrSourceOrIdentifier | IResourceIdentifier | URLRegexp | IResourceIdentifier<CDTPScriptUrl>;

interface ILocationInResource<T extends ScriptOrSourceOrIdentifierOrUrlRegexp> {
    readonly lineNumber: NonNullable<integer>;
    readonly columnNumber?: integer;
    readonly resource: NonNullable<T>;
    readonly location: NonNullable<ZeroBasedLocation>;
}

export type LocationInResource<T extends ScriptOrSourceOrIdentifierOrUrlRegexp> =
    T extends IScript ? LocationInScript :
    T extends ISourceResolver ? LocationInUnbindedSource :
    T extends ILoadedSource ? LocationInLoadedSource :
    T extends IResourceIdentifier ? ILocationInResource<IResourceIdentifier> :
    T extends IResourceIdentifier<CDTPScriptUrl> ? ILocationInResource<IResourceIdentifier<CDTPScriptUrl>> :
    T extends URLRegexp ? ILocationInResource<URLRegexp> :
    never;

abstract class LocationInResourceCommonLogic<T extends ScriptOrSourceOrIdentifierOrUrlRegexp> implements ILocationInResource<T> {
    public get lineNumber(): NonNullable<LineNumber> {
        return this.location.lineNumber;
    }

    public get columnNumber(): ColumnNumber {
        return this.location.columnNumber;
    }

    public toString(): string {
        return `${this.resource}:${this.location}`;
    }

    constructor(
        public readonly resource: NonNullable<T>,
        public readonly location: NonNullable<ZeroBasedLocation>) { }
}

export class LocationInUnbindedSource extends LocationInResourceCommonLogic<ISourceResolver> implements ILocationInResource<ISourceResolver> {
    public get identifier(): ISourceResolver {
        return this.resource;
    }

    public tryGettingLocationInLoadedSource<R>(
        whenSuccesfulDo: (locationInLoadedSource: LocationInResource<ILoadedSource>) => R,
        whenFailedDo: (locationInUnbindedSource: LocationInUnbindedSource) => R): R {
        return this.identifier.tryResolving(
            loadedSource => whenSuccesfulDo(new LocationInLoadedSource(loadedSource, this.location)),
            () => whenFailedDo(this));
    }

    public asLocationWithLoadedSource(loadedSource: ILoadedSource): LocationInLoadedSource {
        if (this.resource.sourceIdentifier.isEquivalent(loadedSource.identifier)) {
            return new LocationInLoadedSource(loadedSource, this.location);
        } else {
            throw new Error(`Can't convert a location with an unbinded source (${this}) to a location with a loaded source that doesn't match the unbinded source: ${loadedSource}`);
        }
    }
}

interface IBindedLocationInResource<T extends ScriptOrSourceOrIdentifierOrUrlRegexp> extends ILocationInResource<T> {
    readonly source: T extends ILoadedSource ? NonNullable<T> : never;
    readonly script: T extends IScript ? NonNullable<T> : never;
    asLocationInLoadedSource(): LocationInLoadedSource;
    asLocationInScript(): LocationInScript;
}

export class LocationInScript extends LocationInResourceCommonLogic<IScript> implements IBindedLocationInResource<IScript> {
    public static fromParameters(script: IScript, lineNumber: LineNumber, columnNumber: ColumnNumber): LocationInScript {
        return new LocationInScript(script, new ZeroBasedLocation(lineNumber, columnNumber));
    }

    public get script(): NonNullable<IScript> {
        return this.resource;
    }

    public get source(): never {
        throw new Error(`LocationInScript doesn't support the source property`);
    }

    public asLocationInLoadedSource(): LocationInLoadedSource {
        const mapped = this.script.sourcesMapper.getSourceLocation({ line: this.lineNumber, column: this.columnNumber });
        if (mapped) {
            const loadedSource = this.script.getSource(parseResourceIdentifier(mapped.source));
            const result = new LocationInLoadedSource(loadedSource, new ZeroBasedLocation(mapped.line, mapped.column));
            logger.verbose(`SourceMap: ${this} to ${result}`);
            return result;
        } else {
            return new LocationInLoadedSource(this.script.developmentSource, this.location);
        }
    }

    public asLocationInScript(): LocationInScript {
        return this;
    }

    public asLocationInUrl(): LocationInUrl {
        if (this.script.runtimeSource.doesScriptHasUrl()) {
            return new LocationInUrl(this.script.runtimeSource.identifier, this.location);
        } else {
            throw new Error(`Can't convert a location in a script without an URL (${this}) into a location in a URL`);
        }
    }

    public isSameAs(locationInScript: LocationInScript): boolean {
        return this.script === locationInScript.script &&
        this.location.isSameAs(locationInScript.location);
    }

    public toString(): string {
        return `${this.resource.runtimeSource}:${this.location}`;
    }
}

export class LocationInLoadedSource extends LocationInResourceCommonLogic<ILoadedSource> implements IBindedLocationInResource<ILoadedSource> {
    public get script(): never {
        throw new Error(`LocationInLoadedSource doesn't support the script property`);
    }

    public get source(): ILoadedSource {
        return this.resource;
    }

    public asLocationInLoadedSource(): LocationInLoadedSource {
        return this;
    }

    public asLocationInScript(): LocationInScript {
        const mapped = this.source.script.sourcesMapper.getScriptLocation({
            source: this.source.identifier.textRepresentation,
            line: this.lineNumber,
            column: this.columnNumber
        });
        if (mapped) {
            const result = new LocationInScript(this.source.script, new ZeroBasedLocation(mapped.line, mapped.column));
            logger.verbose(`SourceMap: ${this} to ${result}`);
            return result;
        } else {
            throw new Error(`Couldn't map the location (${this.location}) in the source $(${this.source}) to a script file`);
        }
    }
}

export class LocationInUrl extends LocationInResourceCommonLogic<IResourceIdentifier<CDTPScriptUrl>> implements ILocationInResource<IResourceIdentifier<CDTPScriptUrl>> {
    public static fromParameters(script: IScript, lineNumber: LineNumber, columnNumber: ColumnNumber): LocationInScript {
        return new LocationInScript(script, new ZeroBasedLocation(lineNumber, columnNumber));
    }

    public get url(): NonNullable<IResourceIdentifier<CDTPScriptUrl>> {
        return this.resource;
    }

    public get source(): never {
        throw new Error(`LocationInScript doesn't support the source property`);
    }
}

export class LocationInUrlRegexp extends LocationInResourceCommonLogic<URLRegexp> implements ILocationInResource<URLRegexp> {
    public get urlRegexp(): NonNullable<URLRegexp> {
        return this.resource;
    }

    public get source(): never {
        throw new Error(`LocationInScript doesn't support the source property`);
    }
}
