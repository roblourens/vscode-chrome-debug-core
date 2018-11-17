import { IResourceIdentifier } from '../resourceIdentifier';

import { IScript } from '../../scripts/script';

import { parseResourceIdentifier } from '../../../..';

import { OutputParameters, EventSender, IEventsToClientReporter } from '../../../client/eventSender';
import { ISourcePathDetails } from '../../../../sourceMaps/sourceMap';
import { determineOrderingOfStrings } from '../../../collections/utilities';
import { inject } from 'inversify';
import { BaseSourceMapTransformer } from '../../../../transformers/baseSourceMapTransformer';
import { DeleteMeScriptsRegistry } from '../../scripts/scriptsRegistry';

export interface IDotScriptCommandDependencies {
    getScriptByUrl(url: IResourceIdentifier): IScript[];
    getScriptSource(identifier: IScript): Promise<string>;
    sendOutputToClient(params: OutputParameters): void;
}

export class DotScriptCommand {
    /**
     * Handle the .scripts command, which can be used as `.scripts` to return a list of all script details,
     * or `.scripts <url>` to show the contents of the given script.
     */
    public handleScriptsCommand(scriptsRest: string): Promise<void> {
        let outputStringP: Promise<string>;
        if (scriptsRest) {
            // `.scripts <url>` was used, look up the script by url
            const requestedScript = this._dependencies.getScriptByUrl(parseResourceIdentifier(scriptsRest));
            if (requestedScript) {
                outputStringP = this._dependencies.getScriptSource(requestedScript[0])
                    .then(result => {
                        const maxLength = 1e5;
                        return result.length > maxLength ?
                            result.substr(0, maxLength) + '[⋯]' :
                            result;
                    });
            } else {
                outputStringP = Promise.resolve(`No runtime script with url: ${scriptsRest}\n`);
            }
        } else {
            outputStringP = this.getAllScriptsString();
        }

        return outputStringP.then(scriptsStr => {
            this._eventsToClientReporter.sendOutput({ output: scriptsStr, category: null });
        });
    }

    private async getAllScriptsString(): Promise<string> {
        const scripts = (await this._scriptsLogic.getAllScripts()).sort((left, script) => determineOrderingOfStrings(left.url, script.url));
        const scriptsPrinted = await Promise.all(scripts.map(script => this.getOneScriptString(script)));
        return scriptsPrinted.join('\n');
    }

    private getOneScriptString(script: IScript): Promise<string> {
        let result = '› ' + script.runtimeSource.identifier.textRepresentation;
        const clientPath = script.developmentSource.identifier.textRepresentation;
        if (script.developmentSource !== script.runtimeSource) result += ` (${clientPath})`;

        return this._sourceMapTransformer.allSourcePathDetails(script.developmentSource.identifier.canonicalized).then(sourcePathDetails => {
            let mappedSourcesStr = sourcePathDetails.map(details => `    - ${details.originalPath} (${details.inferredPath})`).join('\n');
            if (sourcePathDetails.length) mappedSourcesStr = '\n' + mappedSourcesStr;

            return result + mappedSourcesStr;
        });
    }

    constructor(private readonly _dependencies: IDotScriptCommandDependencies,
        @inject(BaseSourceMapTransformer) private readonly _sourceMapTransformer: BaseSourceMapTransformer,
        @inject(DeleteMeScriptsRegistry) private readonly _scriptsLogic: DeleteMeScriptsRegistry,
        @inject(EventSender) private readonly _eventsToClientReporter: IEventsToClientReporter) { }
}
