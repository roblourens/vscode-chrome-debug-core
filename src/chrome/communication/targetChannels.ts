import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../internal/locationInResource';
import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { RequestChannelIdentifier } from './requestsCommunicator';
import { BreakpointRecipieInScript, BreakpointRecipieInUrl, BPRecipie, BreakpointRecipieInUrlRegexp, URLRegexp } from '../internal/breakpoints/bpRecipie';
import { AlwaysBreak, ConditionalBreak } from '../internal/breakpoints/bpBehavior';
import { Breakpoint } from '../internal/breakpoints/breakpoint';
import { ILoadedSource } from '../internal/loadedSource';
import { ScriptParsedEvent } from '../target/events';
import { IScript } from '../internal/script';
import { IResourceIdentifier } from '../internal/resourceIdentifier';

const _debugger = {
    // Notifications
    OnAsyncBreakpointResolved: new NotificationChannelIdentifier<Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),
    OnScriptParsed: new NotificationChannelIdentifier<ScriptParsedEvent>(),

    // Requests
    RemoveBreakpoint: new RequestChannelIdentifier<BPRecipie<ILoadedSource>, Promise<void>>(),
    Resume: new RequestChannelIdentifier<void, Promise<void>>(),
    SetBreakpoint: new RequestChannelIdentifier<BreakpointRecipieInScript<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<IScript>>>(),
    SetBreakpointByUrl: new RequestChannelIdentifier<BreakpointRecipieInUrl<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<IResourceIdentifier>[]>>(),
    SetBreakpointByUrlRegexp: new RequestChannelIdentifier<BreakpointRecipieInUrlRegexp<AlwaysBreak | ConditionalBreak>, Promise<Breakpoint<URLRegexp>[]>>(),
    SupportsColumnBreakpoints: new RequestChannelIdentifier<void, Promise<boolean>>(),
};

const Debugger: Readonly<typeof _debugger> = _debugger;

const _Target = {
    Debugger
};

export const Target: Readonly<typeof _Target> = _Target;
