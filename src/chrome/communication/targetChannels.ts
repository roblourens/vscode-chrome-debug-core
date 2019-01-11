import { ScriptOrSourceOrURLOrURLRegexp } from '../internal/locations/location';
import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { Breakpoint } from '../internal/breakpoints/breakpoint';
import { registerChannels } from './channel';
import { ScriptParsedEvent } from '../cdtpDebuggee/eventsProviders/cdtpOnScriptParsedEventProvider';
import { PausedEvent } from '../cdtpDebuggee/eventsProviders/cdtpDebuggeeExecutionEventsProvider';

const _debugger = {
    // Notifications
    OnAsyncBreakpointResolved: new NotificationChannelIdentifier<Breakpoint<ScriptOrSourceOrURLOrURLRegexp>>(),
    OnScriptParsed: new NotificationChannelIdentifier<ScriptParsedEvent>(),
    OnPaused: new NotificationChannelIdentifier<PausedEvent, void>(),
    OnResumed: new NotificationChannelIdentifier<void, void>(),
};

const Debugger: Readonly<typeof _debugger> = _debugger;

const _Target = {
    Debugger,
};

export const Target: Readonly<typeof _Target> = _Target;

registerChannels(Target, 'Target');
