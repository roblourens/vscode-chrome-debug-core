import { ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInScript } from '../internal/locationInResource';
import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { RequestChannelIdentifier } from './requestsCommunicator';
import { BPRecipieInScript, BPRecipieInUrl, BPRecipie, BPRecipieInUrlRegexp, URLRegexp } from '../internal/breakpoints/bpRecipie';
import { AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpBehavior';
import { Breakpoint } from '../internal/breakpoints/breakpoint';
import { ScriptParsedEvent } from '../target/events';
import { IScript } from '../internal/script';
import { IResourceIdentifier } from '../internal/resourceIdentifier';
import { IRequestedSourceIdentifier } from '../internal/sourceIdentifier';
import { registerChannels } from './channel';
import { RangeInScript } from '../internal/locations/rangeInScript';

const _debugger = {
    // Notifications
    OnAsyncBreakpointResolved: new NotificationChannelIdentifier<Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),
    OnScriptParsed: new NotificationChannelIdentifier<ScriptParsedEvent>(),

    // Requests
    GetPossibleBreakpoints: new RequestChannelIdentifier<RangeInScript, Promise<LocationInScript[]>>(),
    RemoveBreakpoint: new RequestChannelIdentifier<BPRecipie<IRequestedSourceIdentifier>, Promise<void>>(),
    Resume: new RequestChannelIdentifier<void, Promise<void>>(),
    SetBreakpoint: new RequestChannelIdentifier<BPRecipieInScript<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<IScript>>>(),
    SetBreakpointByUrl: new RequestChannelIdentifier<BPRecipieInUrl<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<IResourceIdentifier>[]>>(),
    SetBreakpointByUrlRegexp: new RequestChannelIdentifier<BPRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<URLRegexp>[]>>(),
    SupportsColumnBreakpoints: new RequestChannelIdentifier<void, Promise<boolean>>(),
};

const Debugger: Readonly<typeof _debugger> = _debugger;

const _Target = {
    Debugger
};

export const Target: Readonly<typeof _Target> = _Target;

registerChannels(Target, 'Target');
