import { IResourceIdentifier } from './resourceIdentifier';

// We use this class so the compiler will check that we don't send a file path where the URL provided by CDTP is expected
const CDTPScriptUrlSymbol = Symbol();
export type CDTPScriptUrl = string & { readonly [CDTPScriptUrlSymbol]: true };
export function createCDTPScriptUrl(textRepresentation: string): CDTPScriptUrl {
    return <CDTPScriptUrl>textRepresentation;
}

const ScriptDevelopmentLocationSymbol = Symbol();
export interface ScriptDevelopmentLocation extends IResourceIdentifier {
    readonly [ScriptDevelopmentLocationSymbol]: true;
}

const MappedSourceLocationSymbol = Symbol();
export interface MappedSourceLocation extends IResourceIdentifier {
    readonly [MappedSourceLocationSymbol]: true;
}
