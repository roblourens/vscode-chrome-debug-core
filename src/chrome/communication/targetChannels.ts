/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { MappableBreakpoint } from '../internal/breakpoints/breakpoint';
import { registerChannels } from './channel';
import { IScriptParsedEvent } from '../cdtpDebuggee/eventsProviders/cdtpOnScriptParsedEventProvider';
import { PausedEvent } from '../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';
import { IScript } from '../internal/scripts/script';

const _debugger = {
    // Notifications
    OnAsyncBreakpointResolved: new NotificationChannelIdentifier<MappableBreakpoint<IScript>>(),
    OnScriptParsed: new NotificationChannelIdentifier<IScriptParsedEvent>(),
    OnPaused: new NotificationChannelIdentifier<PausedEvent, void>(),
    OnResumed: new NotificationChannelIdentifier<void, void>(),
};

const Debugger: Readonly<typeof _debugger> = _debugger;

const _Target = {
    Debugger,
};

export const Target: Readonly<typeof _Target> = _Target;

registerChannels(Target, 'Target');
