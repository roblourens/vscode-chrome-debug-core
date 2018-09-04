import { ILoadedSource } from './loadedSource';
import { ValidatedMap } from '../../collections/validatedMap';
import { CDTPDiagnostics } from '../../target/cdtpDiagnostics';
import { printIterable } from '../../collections/printting';

export class SourceTextLogic {
    private _sourceToText = new ValidatedMap<ILoadedSource, string>();

    public async text(loadedSource: ILoadedSource): Promise<string> {
        let text = this._sourceToText.tryGetting(loadedSource);

        if (text !== null) {
            text = await this._chromeDiagnostics.Debugger.getScriptSource(loadedSource.script);
            this._sourceToText.set(loadedSource, text);
        }

        return text;
    }

    public toString(): string {
        return `Sources text logic\n${printIterable('sources in cache', this._sourceToText.keys())}`;
    }

    constructor(private readonly _chromeDiagnostics: CDTPDiagnostics) { }
}