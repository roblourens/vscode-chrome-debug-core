import { utils } from '..';

export interface Protocol {
    version: Version;
    domains: Domain[];
}

export interface Version {
    major: string;
    minor: string;
}

export interface Domain {
    domain: string;
    experimental: boolean;
    dependencies: string[];
    types: Type[];
    events: Event[];
    commands: Command[];
    description: string;
    deprecated?: boolean;
}

export interface Type {
    id: string;
    description: string;
    type: string;
    enum: string[];
    properties: Property[];
    experimental?: boolean;
    items: ItemWithType;
}

export interface Property {
    name: string;
    description: string;
    $ref: string;
    optional?: boolean;
    type: string;
    items: ItemWithRefAndType;
    enum: string[];
    experimental?: boolean;
}

export interface ItemWithType {
    type: string;
}

export interface ItemWithRefAndType extends ItemWithType {
    $ref: string;
}

export interface Event {
    name: string;
    description: string;
    parameters: Parameter[];
    experimental?: boolean;
    deprecated?: boolean;
}

export interface Parameter {
    name: string;
    description: string;
    optional?: boolean;
    $ref: string;
    type: string;
    items: ItemWithRefAndType;
    enum: string[];
    experimental?: boolean;
    deprecated?: boolean;
}

export interface Command {
    name: string;
    description: string;
    experimental: boolean;
    parameters: Parameter[];
    returns: Return[];
    redirect: string;
    deprecated?: boolean;
}

export interface Return {
    name: string;
    description: string;
    type: string;
    items: ItemWithRefAndType;
    $ref: string;
    optional?: boolean;
    experimental?: boolean;
}

export class ChromeProtocolSchema {
    public static async create(address: string, port: number): Promise<ChromeProtocolSchema> {
        const protocol = await utils.getJSONFromURL<Protocol>(`http://${address}:${port}/json/version`);
        return new this(protocol);
    }

    constructor(private _protocol: Protocol) { }

    public isVersionAtLeast(major: number, minor: number): boolean {
        const actualMajor = parseInt(this._protocol.version.major, 10);
        const actualMinor = parseInt(this._protocol.version.minor, 10);
        return major > actualMajor || (major === actualMajor && minor >= actualMinor);
    }
}
