import { ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInScript } from '../internal/locations/locationInResource';
import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { RequestChannelIdentifier } from './requestsCommunicator';
import { BPRecipieInScript, BPRecipieInUrl, BPRecipie, BPRecipieInUrlRegexp, URLRegexp } from '../internal/breakpoints/bpRecipie';
import { AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpActionWhenHit';
import { Breakpoint } from '../internal/breakpoints/breakpoint';
import { ScriptParsedEvent, PausedEvent } from '../target/events';
import { IScript } from '../internal/scripts/script';
import { ISourceResolver } from '../internal/sources/sourceResolver';
import { registerChannels } from './channel';
import { RangeInScript } from '../internal/locations/rangeInScript';
import { IResourceIdentifier } from '../internal/sources/resourceIdentifier';

const _debugger = {
    // Notifications
    OnAsyncBreakpointResolved: new NotificationChannelIdentifier<Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),
    OnScriptParsed: new NotificationChannelIdentifier<ScriptParsedEvent>(),
    OnPaused: new NotificationChannelIdentifier<PausedEvent>(),
    OnPausedDueToInstrumentation: new NotificationChannelIdentifier<PausedEvent>(),

    // Requests
    GetPossibleBreakpoints: new RequestChannelIdentifier<RangeInScript, Promise<LocationInScript[]>>(),
    RemoveBreakpoint: new RequestChannelIdentifier<BPRecipie<ISourceResolver>, Promise<void>>(),
    Resume: new RequestChannelIdentifier<void, Promise<void>>(),
    SetBreakpoint: new RequestChannelIdentifier<BPRecipieInScript<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<IScript>>>(),
    SetBreakpointByUrl: new RequestChannelIdentifier<BPRecipieInUrl<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<IResourceIdentifier>[]>>(),
    SetBreakpointByUrlRegexp: new RequestChannelIdentifier<BPRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<URLRegexp>[]>>(),
    SupportsColumnBreakpoints: new RequestChannelIdentifier<void, Promise<boolean>>(),
    SetInstrumentationBreakpoint: new RequestChannelIdentifier<string, Promise<void>>(),
    RemoveInstrumentationBreakpoint: new RequestChannelIdentifier<string, Promise<void>>(),
};

const Debugger: Readonly<typeof _debugger> = _debugger;

const _Target = {
    Debugger
};

export const Target: Readonly<typeof _Target> = _Target;

registerChannels(Target, 'Target');
