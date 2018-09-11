import { ValidatedMap } from '../../collections/validatedMap';
import { IResourceIdentifier } from '../resourceIdentifier';
import { BPRecipiesInUnbindedSource } from './bpRecipies';
import { BPRecipieIsUnbinded, IBPRecipieStatus } from './bpRecipieStatus';
import { ScriptParsedEvent } from '../../target/events';
import { Communicator } from '../../communication/communicator';
import { Target } from '../../communication/targetChannels';
import { ILoadedSource } from '../loadedSource';
import { Internal } from '../../communication/internalChannels';

export class UnbindedBreakpointsLogic {
    private readonly _sourceIdentifierToBPRecipies = new ValidatedMap<IResourceIdentifier, BPRecipiesInUnbindedSource>();

    private readonly resetBreakpoints = this._communicator.getRequester(Internal.Breakpoints.SetBreakpoints);

    public async setBreakpoints(desiredBPs: BPRecipiesInUnbindedSource): Promise<BPRecipieIsUnbinded[]> {
        this._sourceIdentifierToBPRecipies.set(desiredBPs.requestedSourceIdentifier, desiredBPs);
        return desiredBPs.breakpoints.map(requestedBP => new BPRecipieIsUnbinded(requestedBP, 'TODO DIEGO'));
    }

    public onScriptParsed(scriptParsed: ScriptParsedEvent): void {
        scriptParsed.script.allSources.forEach(source => this.bindUnbindedBreakpoints(source));
    }

    public async bindUnbindedBreakpoints(source: ILoadedSource): Promise<IBPRecipieStatus[]> {
        const unbindBPRecipies = this._sourceIdentifierToBPRecipies.tryGetting(source.identifier);
        if (unbindBPRecipies !== undefined) {
            const status = await this.resetBreakpoints(unbindBPRecipies);
            return status;
        } else {
            return [];
        }
    }

    public toString(): string {
        return `Unbinded BPs logic:\nRequested source identifier to BP recipies: ${this._sourceIdentifierToBPRecipies}`;
    }

    constructor(private readonly _communicator: Communicator) {
        this._communicator.subscribe(Target.Debugger.OnScriptParsed, scriptParsed => this.onScriptParsed(scriptParsed));
    }
}