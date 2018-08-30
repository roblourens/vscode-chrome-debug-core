import { utils } from '../..';
import { MapUsingProjection } from './mapUsingProjection';

export interface IResourceName {
    textRepresentation: string;
}

export class ResourceName implements IResourceName {
    constructor(private _textRepresentation: string) {

    }

    public get textRepresentation(): string {
        return this._textRepresentation;
    }
}

export interface IResourceLocation {
    textRepresentation: string;
}

export type IResourceLocationOrName = IResourceLocation | IResourceName;

export class URL implements IResourceLocation {
    constructor(private _textRepresentation: string) {

    }

    public get textRepresentation(): string {
        return this._textRepresentation;
    }
}

export class LocalFileLocation implements IResourceLocation {
public static fromUrl(fileUrl: string) {
    let urlOrPath = urlOrPath.replace('file:///', '');
    urlOrPath = decodeURIComponent(urlOrPath);
    return new this(urlOrPath);
}

    constructor(private _textRepresentation: string) {

    }

    public get textRepresentation(): string {
        return this._textRepresentation;
    }
}

export function parseResourceAbsoluteLocation(pathToResource: string): IResourceLocation {
    pathToResource = utils.canonicalizeUrl(pathToResource);
    return utils.isURL(pathToResource) ?
        new URL(encodeURI(pathToResource)) :
        new LocalFileLocation(pathToResource);
}

export function newResourcePathMap<V>() {
    return new MapUsingProjection<string, V, string>(path => utils.canonicalizeUrl(path));
}

export function isEquivalentPath(left: string, right: string) {
    return utils.canonicalizeUrl(left) === utils.canonicalizeUrl(right);
}



export function parseResourceLocationOrName(path: string): IResourceLocationOrName {
    if (path.startsWith('file:///')) {
        return LocalFileLocation.fromUrl(path);
    }

}
