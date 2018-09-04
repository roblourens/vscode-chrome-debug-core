import { ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInScript } from '../internal/locations/location';
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
import { Crdp } from '../..';
import { ICallFrame } from '../internal/stackTraces/callFrame';
import { PauseOnExceptionsStrategy } from '../internal/exceptions/strategies';

const _debugger = {
    // Notifications
    OnAsyncBreakpointResolved: new NotificationChannelIdentifier<Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),
    OnScriptParsed: new NotificationChannelIdentifier<ScriptParsedEvent>(),
    OnPaused: new NotificationChannelIdentifier<PausedEvent, void>(),
    OnResumed: new NotificationChannelIdentifier<void, void>(),

    // Requests
    GetPossibleBreakpoints: new RequestChannelIdentifier<RangeInScript, LocationInScript[]>(),
    RemoveBreakpoint: new RequestChannelIdentifier<BPRecipie<ISourceResolver>, void>(),
    Resume: new RequestChannelIdentifier<void, void>(),
    SetBreakpoint: new RequestChannelIdentifier<BPRecipieInScript<AlwaysBreak | ConditionalBreak>, Breakpoint<IScript>>(),
    SetBreakpointByUrl: new RequestChannelIdentifier<BPRecipieInUrl<AlwaysBreak | ConditionalBreak>, Breakpoint<IResourceIdentifier>[]>(),
    SetBreakpointByUrlRegexp: new RequestChannelIdentifier<BPRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>, Breakpoint<URLRegexp>[]>(),
    SupportsColumnBreakpoints: new RequestChannelIdentifier<void, boolean>(),
    SetInstrumentationBreakpoint: new RequestChannelIdentifier<string, void>(),
    RemoveInstrumentationBreakpoint: new RequestChannelIdentifier<string, void>(),
    PauseOnAsyncCall: new RequestChannelIdentifier<Crdp.Runtime.StackTraceId, void>(),
    SetPauseOnExceptions: new RequestChannelIdentifier<PauseOnExceptionsStrategy, void>(),

    StepOver: new RequestChannelIdentifier<void, void>(),
    StepInto: new RequestChannelIdentifier<Crdp.Debugger.StepIntoRequest, void>(),
    StepOut: new RequestChannelIdentifier<void, void>(),
    Pause: new RequestChannelIdentifier<void, void>(),
    RestartFrame: new RequestChannelIdentifier<ICallFrame<IScript>, Crdp.Debugger.RestartFrameResponse>(),
};

const Debugger: Readonly<typeof _debugger> = _debugger;

const _Target = {
    Debugger
};

export const Target: Readonly<typeof _Target> = _Target;

registerChannels(Target, 'Target');
