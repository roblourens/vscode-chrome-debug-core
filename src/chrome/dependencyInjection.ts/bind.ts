/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Container, interfaces } from 'inversify';
import { TYPES } from './types';
import { EventSender } from '../client/eventSender';
import { CDTPBreakpointFeaturesSupport } from '../cdtpDebuggee/features/cdtpBreakpointFeaturesSupport';
import { IStackTracePresentationLogicProvider, StackTracesLogic } from '../internal/stackTraces/stackTracesLogic';
import { SourcesLogic } from '../internal/sources/sourcesLogic';
import { CDTPScriptsRegistry } from '../cdtpDebuggee/registries/cdtpScriptsRegistry';
import { ClientToInternal } from '../client/clientToInternal';
import { InternalToClient } from '../client/internalToClient';
import { BreakpointsLogic } from '../internal/breakpoints/features/breakpointsLogic';
import { PauseOnExceptionOrRejection } from '../internal/exceptions/pauseOnException';
import { Stepping } from '../internal/stepping/stepping';
import { DotScriptCommand } from '../internal/sources/features/dotScriptsCommand';
import { BreakpointsRegistry } from '../internal/breakpoints/registries/breakpointsRegistry';
import { ReAddBPsWhenSourceIsLoaded } from '../internal/breakpoints/features/reAddBPsWhenSourceIsLoaded';
import { PauseScriptLoadsToSetBPs } from '../internal/breakpoints/features/pauseScriptLoadsToSetBPs';
import { BPRecipieAtLoadedSourceLogic } from '../internal/breakpoints/features/bpRecipieAtLoadedSourceLogic';
import { DeleteMeScriptsRegistry } from '../internal/scripts/scriptsRegistry';
import { SyncStepping } from '../internal/stepping/features/syncStepping';
import { AsyncStepping } from '../internal/stepping/features/asyncStepping';
import { CDTPExceptionThrownEventsProvider } from '../cdtpDebuggee/eventsProviders/cdtpExceptionThrownEventsProvider';
import { CDTPExecutionContextEventsProvider } from '../cdtpDebuggee/eventsProviders/cdtpExecutionContextEventsProvider';
import { CDTPInspectDebugeeState } from '../cdtpDebuggee/features/cdtpInspectDebugeeState';
import { CDTPUpdateDebugeeState } from '../cdtpDebuggee/features/cdtpUpdateDebugeeState';
import { SmartStepLogic } from '../internal/features/smartStep';
import { LineColTransformer } from '../../transformers/lineNumberTransformer';
import { ChromeDebugLogic } from '../chromeDebugAdapter';
import { CDTPOnScriptParsedEventProvider } from '../cdtpDebuggee/eventsProviders/cdtpOnScriptParsedEventProvider';
import { CDTDebuggeeExecutionEventsProvider } from '../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { CDTPDebuggeeBreakpoints } from '../cdtpDebuggee/features/cdtpDebuggeeBreakpoints';
import { IDOMInstrumentationBreakpoints, CDTPDOMDebugger } from '../cdtpDebuggee/features/cdtpDOMInstrumentationBreakpoints';
import { CDTPBrowserNavigator } from '../cdtpDebuggee/features/cdtpBrowserNavigator';
import { CDTPLogEventsProvider } from '../cdtpDebuggee/eventsProviders/cdtpLogEventsProvider';
import { CDTPConsoleEventsProvider } from '../cdtpDebuggee/eventsProviders/cdtpConsoleEventsProvider';
import { IAsyncDebuggingConfigurer, CDTPAsyncDebuggingConfigurer } from '../cdtpDebuggee/features/cdtpAsyncDebuggingConfigurer';
import { IScriptSourcesRetriever, CDTPScriptSourcesRetriever } from '../cdtpDebuggee/features/cdtpScriptSourcesRetriever';
import { CDTPDebugeeExecutionController } from '../cdtpDebuggee/features/cdtpDebugeeExecutionController';
import { CDTPPauseOnExceptionsConfigurer } from '../cdtpDebuggee/features/cdtpPauseOnExceptionsConfigurer';
import { CDTPDebugeeSteppingController } from '../cdtpDebuggee/features/cdtpDebugeeSteppingController';
import { CDTPDebugeeRuntimeVersionProvider } from '../cdtpDebuggee/features/cdtpDebugeeRuntimeVersionProvider';
import { CDTPBlackboxPatternsConfigurer } from '../cdtpDebuggee/features/cdtpBlackboxPatternsConfigurer';
import { CDTPDomainsEnabler } from '../cdtpDebuggee/infrastructure/cdtpDomainsEnabler';

export function bindAll(di: Container) {
    bind<IDOMInstrumentationBreakpoints>(di, TYPES.IDOMInstrumentationBreakpoints, CDTPDOMDebugger);
    bind<IAsyncDebuggingConfigurer>(di, TYPES.IAsyncDebuggingConfiguration, CDTPAsyncDebuggingConfigurer);
    bind<IScriptSourcesRetriever>(di, TYPES.IScriptSources, CDTPScriptSourcesRetriever);
    bind<IStackTracePresentationLogicProvider>(di, TYPES.IStackTracePresentationLogicProvider, SmartStepLogic);
    //  bind<IStackTracePresentationLogicProvider>(di, TYPES.IStackTracePresentationLogicProvider, SkipFilesLogic);
    bind(di, TYPES.IEventsToClientReporter, EventSender);
    bind(di, TYPES.ChromeDebugLogic, ChromeDebugLogic);
    bind(di, TYPES.SourcesLogic, SourcesLogic);
    bind(di, TYPES.CDTPScriptsRegistry, CDTPScriptsRegistry);
    bind(di, TYPES.ClientToInternal, ClientToInternal);
    bind(di, TYPES.InternalToClient, InternalToClient);
    bind(di, TYPES.StackTracesLogic, StackTracesLogic);
    bind(di, TYPES.BreakpointsLogic, BreakpointsLogic);
    bind(di, TYPES.PauseOnExceptionOrRejection, PauseOnExceptionOrRejection);
    bind(di, TYPES.Stepping, Stepping);
    bind(di, TYPES.DotScriptCommand, DotScriptCommand);
    bind(di, TYPES.BreakpointsRegistry, BreakpointsRegistry);
    bind(di, TYPES.ReAddBPsWhenSourceIsLoaded, ReAddBPsWhenSourceIsLoaded);
    bind(di, TYPES.PauseScriptLoadsToSetBPs, PauseScriptLoadsToSetBPs);
    bind(di, TYPES.EventSender, EventSender);
    bind(di, TYPES.DeleteMeScriptsRegistry, DeleteMeScriptsRegistry);
    //  bind<BaseSourceMapTransformer>(di, TYPES.BaseSourceMapTransformer, BaseSourceMapTransformer);
    //  bind<BasePathTransformer>(di, TYPES.BasePathTransformer, BasePathTransformer);
    //  bind<IStackTracePresentationLogicProvider>(di, TYPES.IStackTracePresentationLogicProvider, SkipFilesLogic);
    bind(di, TYPES.IDebugeeExecutionControl, CDTPDebugeeExecutionController);
    bind(di, TYPES.IPauseOnExceptions, CDTPPauseOnExceptionsConfigurer);
    bind(di, TYPES.IBreakpointFeaturesSupport, CDTPBreakpointFeaturesSupport);
    bind(di, TYPES.IInspectDebugeeState, CDTPInspectDebugeeState);
    bind(di, TYPES.IUpdateDebugeeState, CDTPUpdateDebugeeState);
    bind(di, TYPES.BPRecipieInLoadedSourceLogic, BPRecipieAtLoadedSourceLogic);
    bind(di, TYPES.SyncStepping, SyncStepping);
    bind(di, TYPES.AsyncStepping, AsyncStepping);
    // bind<cdtpBreakpointIdsRegistry>(di, cdtpBreakpointIdsRegistry, cdtpBreakpointIdsRegistry);
    bind(di, TYPES.ExceptionThrownEventProvider, CDTPExceptionThrownEventsProvider);
    bind(di, TYPES.ExecutionContextEventsProvider, CDTPExecutionContextEventsProvider);
    bind(di, TYPES.LineColTransformer, LineColTransformer);
    bind(di, TYPES.IBrowserNavigation, CDTPBrowserNavigator);
    bind(di, TYPES.IScriptParsedProvider, CDTPOnScriptParsedEventProvider);
    bind(di, TYPES.ICDTPDebuggerEventsProvider, CDTDebuggeeExecutionEventsProvider);
    bind(di, TYPES.IDebugeeVersionProvider, CDTPDebugeeRuntimeVersionProvider);
    bind(di, TYPES.ITargetBreakpoints, CDTPDebuggeeBreakpoints);
    bind(di, TYPES.IConsoleEventsProvider, CDTPConsoleEventsProvider);
    bind(di, TYPES.ILogEventsProvider, CDTPLogEventsProvider);
    bind(di, TYPES.IDebugeeSteppingController, CDTPDebugeeSteppingController);
    bind(di, TYPES.IBlackboxPatternsConfigurer, CDTPBlackboxPatternsConfigurer);
    bind(di, TYPES.IDomainsEnabler, CDTPDomainsEnabler);
}

function bind<T extends object>(container: Container, serviceIdentifier: interfaces.ServiceIdentifier<T>, newable: interfaces.Newable<T>): void {
    container.bind<T>(serviceIdentifier).to(newable).inSingletonScope().onActivation((_context, object) => {
        return object;
        /// return new MethodsCalledLogger<T>(object, serviceIdentifier.toString()).wrapped();
    });
}
