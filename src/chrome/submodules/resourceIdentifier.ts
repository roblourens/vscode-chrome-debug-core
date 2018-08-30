import { utils } from '../..';
import { MapUsingProjection } from './mapUsingProjection';

/** Hierarchy:
 * IResourceIdentifier: Identifies a resource
 *   IResourceLocation: Identifies and tells us how to get the resource
 *     URL: Url
 *       LocalFileURL: file:///<something here>
 *       NonLocalFileURL: Every URL except file:///<something here>
 *     LocalFilePath: An OS format to identify it's files
 *       WindowLocalFilePath: Windows format to identify its files
 *       UnixLocalFilePath: *nix (Unix, Linux, Mac) format to identify its files
 *       UnrecognizedFilePath: If we cannot recognize it as a Windows or *nix format we'll asume it's a format we don't understand
 *   ResourceName: Identifies a resource without telling us how to get it
 */

export interface IResourceIdentifier {
    textRepresentation: string;
    canonicalized: string;
    isEquivalent(right: IResourceIdentifier): boolean;
}

export abstract class ResourceIdentifierCommonLogic {
    public abstract get canonicalized(): string;

    public isEquivalent(right: IResourceIdentifier): boolean {
        return this.canonicalized === right.canonicalized;
    }
}

export abstract class ResourceIdentifierWithTextRepresentationCommonLogic extends ResourceIdentifierCommonLogic {
    public get textRepresentation(): string {
        return this._textRepresentation;
    }

    constructor(private _textRepresentation: string) {
        super();
    }
}

export abstract class NoCanonicalizationResourceIdentifierCommonLogic extends ResourceIdentifierWithTextRepresentationCommonLogic {
    public get canonicalized(): string {
        return this.textRepresentation;
    }
}

// A resource name is any string that identifies the resource, but doesn't tell us how to find it's contents
export class ResourceName extends NoCanonicalizationResourceIdentifierCommonLogic { }

// A resource location is any string that identifies the resource, and also tell us how to find it's contents
export interface IResourceLocation extends IResourceIdentifier { }

// A standard URL
export interface URL extends IResourceLocation { }

// A local file URL is a 'file:///' url
export class LocalFileURL extends ResourceIdentifierCommonLogic implements URL {
    private _localResourcePath: LocalFilePath;

    public static isValid(path: string) {
        return path.startsWith('file:///');
    }

    public get textRepresentation(): string {
        return `file://${this._localResourcePath}`;
    }

    public get canonicalized(): string {
        return this._localResourcePath.canonicalized;
    }

    constructor(fileUrl: string) {
        super();
        let filePath = decodeURIComponent(fileUrl.replace(`^file://`, ''));
        this._localResourcePath = parseLocalResourcePath(filePath);
    }
}

export class NonLocalFileURL extends NoCanonicalizationResourceIdentifierCommonLogic implements URL { }

// A local resource location is any string that identifies the resource in the local computer, and also tell us how to find it's contents
// e.g.: /home/user/proj/myfile.js
// e.g.: C:\proj\myfile.js
export interface LocalFilePath extends IResourceLocation { }

// A unix local resource location is a *nix path
// e.g.: /home/user/proj/myfile.js
export class UnixLocalFilePath extends NoCanonicalizationResourceIdentifierCommonLogic implements LocalFilePath {
    public static isValid(path: string) {
        return path.startsWith('/');
    }
}

// A windows local file path
// e.g.: C:\proj\myfile.js
export class WindowLocalFilePath extends ResourceIdentifierWithTextRepresentationCommonLogic implements LocalFilePath {
    public static isValid(path: string) {
        return path.match(/^[A-Za-z]:/);
    }

    public get canonicalized(): string {
        return this.textRepresentation.toLowerCase();
    }
}

// Any file path that we don't recognize as Windows nor Linux
export class UnrecognizedFilePath extends NoCanonicalizationResourceIdentifierCommonLogic implements LocalFilePath { }

function parseWindowsOrUnixLocalResourcePath(path: string): LocalFilePath | null {
    if (WindowLocalFilePath.isValid(path)) {
        return new WindowLocalFilePath(path);
    } else if (UnixLocalFilePath.isValid(path)) {
        return new UnixLocalFilePath(path);
    } else {
        return null;
    }
}

function parseLocalResourcePath(path: string): LocalFilePath {
    const recognizedLocalResourcePath = parseWindowsOrUnixLocalResourcePath(path);
    if (recognizedLocalResourcePath !== null) {
        return recognizedLocalResourcePath;
    } else {
        return new UnrecognizedFilePath(path);
    }
}

function parseURL(textRepresentation: string): URL {
    if (LocalFileURL.isValid(textRepresentation)) {
        return new LocalFileURL(textRepresentation);
    } else {
        return new NonLocalFileURL(textRepresentation);
    }
}

/**
 * Sample formats:
 * file:///D:\\scripts\\code.js
 * file:///Users/me/project/code.js
 * c:/scripts/code.js
 * http://site.com/scripts/code.js
 * http://site.com/
 */
export function parseResourceIdentifier(textRepresentation: string): IResourceIdentifier {
    if (utils.isURL(textRepresentation)) {
        return parseURL(textRepresentation);
    } else { // It could be a file path or a name
        const recognizedLocalResourcePath = parseWindowsOrUnixLocalResourcePath(textRepresentation);
        if (recognizedLocalResourcePath !== null) {
            return recognizedLocalResourcePath;
        } else {
            // If we don't recognize this as any known formats, we assume it's an opaque identifier (a name)
            return new ResourceName(textRepresentation);
        }
    }
}

export function newResourceIdentifierMap<V>() {
    return new MapUsingProjection<string, V, string>(path => utils.canonicalizeUrl(path));
}
