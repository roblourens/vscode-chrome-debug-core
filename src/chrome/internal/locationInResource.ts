import * as Validation from '../../validation';
import { IScript } from './script';
import { ISourceIdentifier } from './sourceIdentifier';
import { parseResourceIdentifier } from './resourceIdentifier';
import { ILoadedSource } from './loadedSource';

export type integer = number;

export class ZeroBasedLocation {
    constructor(
        public readonly lineNumber: NonNullable<integer>,
        public readonly columnNumber?: integer) {
        Validation.zeroOrPositive('Line number', lineNumber);
        if (columnNumber !== undefined && columnNumber !== null) {
            Validation.zeroOrPositive('Column number', columnNumber);
        }
    }
}

export type ScriptOrSource = IScript | ILoadedSource;
export type ScriptOrSourceOrIdentifier = ScriptOrSource | ISourceIdentifier;

interface ILocationInResource<T extends ScriptOrSourceOrIdentifier> {
    readonly lineNumber: NonNullable<integer>;
    readonly columnNumber?: integer;
    readonly resource: NonNullable<T>;
    readonly location: NonNullable<ZeroBasedLocation>;
}

export type LocationInResource<T extends ScriptOrSourceOrIdentifier> =
    T extends IScript ? LocationInScript :
    T extends ISourceIdentifier ? LocationInUnbindedSource :
    T extends ILoadedSource ? LocationInLoadedSource :
    never;

abstract class LocationInResourceCommonLogic<T extends ScriptOrSourceOrIdentifier> implements ILocationInResource<T> {
    constructor(
        public readonly resource: NonNullable<T>,
        public readonly location: NonNullable<ZeroBasedLocation>) { }

    public get lineNumber(): NonNullable<integer> {
        return this.location.lineNumber;
    }

    public get columnNumber(): integer {
        return this.location.lineNumber;
    }
}

export class LocationInUnbindedSource extends LocationInResourceCommonLogic<ISourceIdentifier> implements ILocationInResource<ISourceIdentifier> {
    public get identifier(): ISourceIdentifier {
        return this.resource;
    }

    public tryGettingLocationInLoadedSource<R>(
        whenSuccesfulDo: (locationInLoadedSource: LocationInResource<ILoadedSource>) => R,
        whenFailedDo: (locationInUnbindedSource: LocationInUnbindedSource) => R): R {
        return this.identifier.tryGettingLoadedSource(
            loadedSource => whenSuccesfulDo(new LocationInLoadedSource(loadedSource, this.location)),
            () => whenFailedDo(this));
    }
}

interface IBindedLocationInResource<T extends ScriptOrSource> extends ILocationInResource<T> {
    readonly source: T extends ILoadedSource ? NonNullable<T> : never;
    readonly script: T extends IScript ? NonNullable<T> : never;
    asLocationInLoadedSource(): LocationInLoadedSource;
    asLocationInScript(): LocationInScript;
}

export class LocationInScript extends LocationInResourceCommonLogic<IScript> implements IBindedLocationInResource<IScript> {
    public static fromParameters(script: IScript, lineNumber: number, columnNumber: number): LocationInScript {
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
            return new LocationInLoadedSource(loadedSource, new ZeroBasedLocation(mapped.line, mapped.column));
        } else {
            return new LocationInLoadedSource(this.script.developmentSource, this.location);
        }
    }

    public asLocationInScript(): LocationInScript {
        return this;
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
            return new LocationInScript(this.source.script, new ZeroBasedLocation(mapped.line, mapped.column));
        } else {
            throw new Error(`Couldn't map the location (${this.location}) in the source $(${this.source}) to a script file`);
        }
    }
}

// export function createLocationInResource<T extends ScriptOrSource>(
//     resource: NonNullable<T>,
//     lineNumber: NonNullable<integer>,
//     columnNumber?: integer): NonNullable<LocationInResource<T>> {
//     const location = new ZeroBasedLocation(lineNumber, columnNumber);
//     if (resource instanceof Script) {
//         return new LocationInScript(resource, location) as NonNullable<LocationInResource<T>>;
//     } else if (resource instanceof SourceIdentifiedByPath) {
//         return new LocationInUnbindedSource(resource as SourceIdentifiedByPath, location) as NonNullable<LocationInResource<T>>;
//     } else { // If not it must be a loaded source
//         return new LocationInLoadedSource(resource as ILoadedSource, location) as NonNullable<LocationInResource<T>>;
//     }
// }