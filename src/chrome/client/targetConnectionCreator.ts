import { utils, IClientCapabilities, ILaunchRequestArgs, IAttachRequestArgs, ChromeDebugSession, BaseSourceMapTransformer } from '../..';

import * as errors from '../../errors';

import { CDTPDiagnostics } from '../target/cdtpDiagnostics';
import { ChromeConnection } from '../chromeConnection';
import { StackTraceDependencies } from '../internal/stackTraces/stackTracesLogic';
import { ISkipFilesLogicDependencies } from '../internal/features/skipFiles';
import { BreakpointsLogicDependencies } from '../internal/breakpoints/breakpointsLogic';
import { LoggingCommunicator, Communicator, ICommunicator } from '../communication/communicator';
import { ExecutionLogger } from '../logging/executionLogger';
import { Internal } from '../communication/internalChannels';
import { Client } from '../communication/clientChannels';
import { Target } from '../communication/targetChannels';
import { CDTPScriptsRegistry } from '../target/cdtpScriptsRegistry';
import { ILoadedSource } from '../internal/sources/loadedSource';
import { asyncMap } from '../collections/async';
import { PauseOnExceptionDependencies } from '../internal/exceptions/pauseOnException';
import { SteppingDependencies } from '../internal/stepping/stepping';
import { TakeProperActionOnPausedEventDependencies } from '../internal/features/takeProperActionOnPausedEvent';
import { IDotScriptCommandDependencies } from '../internal/sources/features/dotScriptsCommand';
import { IExtensibilityPoints } from '../extensibility/extensibilityPoints';
import { LoggingConfiguration, Logging } from '../internal/services/logging';

export interface Dependencies extends BreakpointsLogicDependencies, PauseOnExceptionDependencies, SteppingDependencies,
    StackTraceDependencies, TakeProperActionOnPausedEventDependencies, ISkipFilesLogicDependencies, IDotScriptCommandDependencies { }

export class DependenciesCreator {
    constructor(
        private readonly communicator: ICommunicator,
        private readonly _chromeDiagnostics: CDTPDiagnostics,
        private readonly _scriptsLogic: CDTPScriptsRegistry,
        private readonly _sourceMapTransformer: BaseSourceMapTransformer) { }
    public create(): Dependencies {
        const onLoadedSourceIsAvailable = (listener: (source: ILoadedSource) => void) => {
            this.communicator.subscribe(Target.Debugger.OnScriptParsed, async scriptParsed => {
                await asyncMap(scriptParsed.script.allSources, listener);
            });
        };

        return {
            onLoadedSourceIsAvailable: onLoadedSourceIsAvailable,

            notifyNoPendingBPs: this.communicator.getPublisher(Internal.Breakpoints.OnNoPendingBreakpoints),

            onResumed: this.communicator.getSubscriber(Target.Debugger.OnResumed),
            onPaused: this.communicator.getSubscriber(Target.Debugger.OnPaused),
            onAsyncBreakpointResolved: this.communicator.getSubscriber(Target.Debugger.OnAsyncBreakpointResolved),

            getScriptByUrl: path => this._scriptsLogic.getScriptsByPath(path),
            getScriptSource: this.communicator.getRequester(Target.Debugger.GetScriptSource),

            onScriptParsed: this.communicator.getSubscriber(Target.Debugger.OnScriptParsed),
        };
    }
}
