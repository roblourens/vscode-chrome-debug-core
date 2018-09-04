import { IResourceIdentifier } from './resourceIdentifier';

const CDTPScriptUrlSymbol = Symbol();
export type CDTPScriptUrl = string & { [CDTPScriptUrlSymbol]: true };

const ScriptDevelopmentLocationSymbol = Symbol();
export interface ScriptDevelopmentLocation extends IResourceIdentifier {
    [ScriptDevelopmentLocationSymbol]: true;
}

const SourceOfCompiledLocationSymbol = Symbol();
export interface SourceOfCompiledLocation extends IResourceIdentifier {
    [SourceOfCompiledLocationSymbol]: true;
}
