import { ILoadedSource } from './loadedSource';
import { ValidatedMap } from '../../collections/validatedMap';
import { printIterable } from '../../collections/printting';
import { IComponent } from '../features/feature';
import { IScript } from '../scripts/script';

export interface SourceTextLogicDependencies {
    getScriptSource(identifier: IScript): Promise<string>;
}

export class SourceTextLogic implements IComponent {
    private _sourceToText = new ValidatedMap<ILoadedSource, string>();

    public async text(loadedSource: ILoadedSource): Promise<string> {
        let text = this._sourceToText.tryGetting(loadedSource);

        if (text !== null) {
            text = await this._dependencies.getScriptSource(loadedSource.script);
            this._sourceToText.set(loadedSource, text);
        }

        return text;
    }

    public toString(): string {
        return `Sources text logic\n${printIterable('sources in cache', this._sourceToText.keys())}`;
    }

    public install(): this {
        return this;
    }

    constructor(private readonly _dependencies: SourceTextLogicDependencies) { }
}