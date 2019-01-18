/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

 import { IEventsConsumedByStackTrace } from '../../internal/stackTraces/stackTracesLogic';
import { IEventsConsumedBySkipFilesLogic } from '../../internal/features/skipFiles';
import { EventsConsumedByBreakpointsLogic } from '../../internal/breakpoints/features/breakpointsLogic';
import { ICommunicator } from '../../communication/communicator';
import { Internal } from '../../communication/internalChannels';
import { Target } from '../../communication/targetChannels';
import { ILoadedSource } from '../../internal/sources/loadedSource';
import { asyncMap } from '../../collections/async';
import { IEventsConsumedByPauseOnException } from '../../internal/exceptions/pauseOnException';
import { IEventsConsumedByTakeProperActionOnPausedEvent } from '../../internal/features/takeProperActionOnPausedEvent';
import { IEventsConsumedBySourceResolver } from '../../internal/sources/sourceResolver';
import { IEventsConsumedBySmartStepLogic } from '../../internal/features/smartStep';
import { IEventsConsumedByReAddBPsWhenSourceIsLoaded } from '../../internal/breakpoints/features/reAddBPsWhenSourceIsLoaded';
import { IEventsConsumedByAsyncStepping } from '../../internal/stepping/features/asyncStepping';
// import { EventsConsumedBySyncStepping } from '../../internal/stepping/features/syncStepping';

export interface IEventsConsumedByConnectedCDA extends EventsConsumedByBreakpointsLogic, IEventsConsumedByPauseOnException,
    IEventsConsumedByStackTrace, IEventsConsumedByTakeProperActionOnPausedEvent, IEventsConsumedBySkipFilesLogic,
    IEventsConsumedBySourceResolver, IEventsConsumedBySmartStepLogic,
    IEventsConsumedByReAddBPsWhenSourceIsLoaded, IEventsConsumedByAsyncStepping { }

export class ConnectedCDAEventsCreator {
    constructor(private readonly communicator: ICommunicator) { }

    public create(): IEventsConsumedByConnectedCDA {
        const onLoadedSourceIsAvailable = (listener: (source: ILoadedSource) => void) => {
            this.communicator.subscribe(Target.Debugger.OnScriptParsed, async scriptParsed => {
                await asyncMap(scriptParsed.script.allSources, listener);
            });
        };

        return {
            onLoadedSourceIsAvailable: onLoadedSourceIsAvailable,

            notifyNoPendingBPs: this.communicator.getPublisher(Internal.Breakpoints.OnNoPendingBreakpoints),
            onNoPendingBreakpoints: this.communicator.getSubscriber(Internal.Breakpoints.OnNoPendingBreakpoints),

            onResumed: this.communicator.getSubscriber(Target.Debugger.OnResumed),
            // onPaused: this.communicator.getSubscriber(Target.Debugger.OnPaused),
            onAsyncBreakpointResolved: this.communicator.getSubscriber(Target.Debugger.OnAsyncBreakpointResolved),

            onScriptParsed: this.communicator.getSubscriber(Target.Debugger.OnScriptParsed),

            subscriberForAskForInformationAboutPaused: this.communicator.getSubscriber(Internal.Breakpoints.OnPausedOnBreakpoint),
            askForInformationAboutPause: this.communicator.getPublisher(Internal.Breakpoints.OnPausedOnBreakpoint),
            publishGoingToPauseClient: this.communicator.getPublisher(Internal.Breakpoints.OnGoingToPauseClient)
        };
    }
}
