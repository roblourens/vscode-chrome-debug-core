import { Crdp } from '../..';
import { BidirectionalMap } from './bidirectionalMap';
import { IResourceIdentifier, parseResourceIdentifier, newResourceIdentifierMap } from './resourceIdentifier';
import { IRuntimeScript } from './runtimeScript';
import { newSourceIdentifierMap } from './loadedSource';

export class RuntimeScriptsManager {
    private _currentExecutionContext = new ExecutionContext();

    public getRuntimeScriptsByNameOrLocation(nameOrLocation: IResourceIdentifier): IRuntimeScript[] {
        return this._currentExecutionContext.getRuntimeScriptsByNameOrLocation(nameOrLocation);
    }

    public getCrdpId(runtimeScript: IRuntimeScript): any {
        return this._currentExecutionContext.getCrdpId(runtimeScript);
    }

    public addNewRuntimeScript(scriptId: Crdp.Runtime.ScriptId, runtimeScript: IRuntimeScript): void {
        return this._currentExecutionContext.addNewRuntimeScript(scriptId, runtimeScript);
    }

    public getById(runtimeScriptCrdpId: Crdp.Runtime.ScriptId): IRuntimeScript {
        return this._currentExecutionContext.scriptById(runtimeScriptCrdpId);
    }

    public constructor() {
    }
}

export class ExecutionContext {
    private _runtimeScriptByCrdpId = new BidirectionalMap<Crdp.Runtime.ScriptId, IRuntimeScript>();
    private _runtimeScriptByNameOrLocation = newSourceIdentifierMap<IRuntimeScript[]>();

    public getCrdpId(runtimeScript: IRuntimeScript): Crdp.Runtime.ScriptId {
        const crdpId = this._runtimeScriptByCrdpId.getByRight(runtimeScript);
        if (!runtimeScript) {
            throw new Error(`Couldn't find a CRDP id for runtime script ${runtimeScript}`);
        }

        return crdpId;
    }

    public getRuntimeScriptsByNameOrLocation(nameOrLocation: IResourceIdentifier): IRuntimeScript[] {
        const runtimeScript = this._runtimeScriptByNameOrLocation.get(nameOrLocation.textRepresentation);
        if (!runtimeScript) {
            throw new Error(`Couldn't find a runtime script with name or location of ${nameOrLocation}`);
        }

        return runtimeScript;
    }

    public addNewRuntimeScript(scriptId: Crdp.Runtime.ScriptId, runtimeScript: IRuntimeScript): void {
        this._runtimeScriptByCrdpId.set(scriptId, runtimeScript);
        const nameOrLocationTextRepresentation = parseResourceIdentifier(runtimeScript.url).textRepresentation;
        let runtimeScriptsWithThisNameOrLocation = this._runtimeScriptByNameOrLocation.get(nameOrLocationTextRepresentation);
        if (runtimeScriptsWithThisNameOrLocation !== undefined) {
            runtimeScriptsWithThisNameOrLocation.push(runtimeScript);
        } else {
            this._runtimeScriptByNameOrLocation.set(nameOrLocationTextRepresentation, [runtimeScript]);
        }
    }

    public scriptById(runtimeScriptCrdpId: string): IRuntimeScript {
        const runtimeScript = this._runtimeScriptByCrdpId.getByLeft(runtimeScriptCrdpId);
        if (!runtimeScript) {
            throw new Error(`Couldn't find a runtime script with CRDP id of ${runtimeScriptCrdpId}`);
        }

        return runtimeScript;
    }
}
