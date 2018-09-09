import { Crdp } from '../..';
import { IScript } from '../internal/script';
import { newResourceIdentifierMap, IResourceIdentifier } from '../internal/resourceIdentifier';
import { ValidatedMap } from '../collections/validatedMap';

export class RuntimeScriptsManager {
    private readonly _currentExecutionContext = new ExecutionContext();

    public registerNewScript(scriptId: Crdp.Runtime.ScriptId, obtainScript: () => Promise<IScript>): Promise<IScript> {
        return this._currentExecutionContext.registerNewScript(scriptId, obtainScript);
    }

    public getCrdpId(script: IScript): any {
        return this._currentExecutionContext.getCdtpId(script);
    }

    public getScriptById(runtimeScriptCrdpId: Crdp.Runtime.ScriptId): Promise<IScript> {
        return this._currentExecutionContext.scriptById(runtimeScriptCrdpId);
    }

    public getScriptsByPath(nameOrLocation: IResourceIdentifier): IScript[] {
        return this._currentExecutionContext.getScriptByPath(nameOrLocation);
    }

    public getAllScripts(): IterableIterator<Promise<IScript>> {
        return this._currentExecutionContext.getAllScripts();
    }
}

const scriptId = Symbol('secretScriptId');

interface HasScriptId {
    [scriptId]: Crdp.Runtime.ScriptId;
}

export class ExecutionContext {
    private readonly _scriptByCdtpId = new ValidatedMap<Crdp.Runtime.ScriptId, Promise<IScript>>();
    private readonly _scriptByPath = newResourceIdentifierMap<IScript[]>();

    public async registerNewScript(scriptId: Crdp.Runtime.ScriptId, obtainScript: () => Promise<IScript>): Promise<IScript> {
        const scriptPromise = obtainScript();
        this._scriptByCdtpId.set(scriptId, scriptPromise);
        const script = await scriptPromise;

        (script as any)[scriptId] = scriptId;

        const runtimePath = script.runtimeSource.identifier;
        let scriptsWithSamePath = this._scriptByPath.tryGetting(runtimePath);
        if (scriptsWithSamePath !== undefined) {
            scriptsWithSamePath.push(script);
        } else {
            this._scriptByPath.set(runtimePath, [script]);
        }

        return script;
    }

    public getCdtpId(script: IScript): Crdp.Runtime.ScriptId {
        // We use any because we want this property to be hidden
        const scriptWithScriptId = script as any as HasScriptId;
        const crdpId = scriptWithScriptId[scriptId];
        if (!script) {
            throw new Error(`Couldn't find a CRDP id for script ${script}`);
        }

        return crdpId;
    }

    public scriptById(runtimeScriptCrdpId: string): Promise<IScript> {
        return this._scriptByCdtpId.get(runtimeScriptCrdpId);
    }

    public getScriptByPath(path: IResourceIdentifier): IScript[] {
        const runtimeScript = this._scriptByPath.tryGetting(path);
        return runtimeScript || [];
    }

    public getAllScripts(): IterableIterator<Promise<IScript>> {
        return this._scriptByCdtpId.values();
    }
}
