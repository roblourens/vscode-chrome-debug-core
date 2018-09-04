import { RequestChannelIdentifier } from './requestsCommunicator';
import { BPRecipiesInUnresolvedSource } from '../internal/breakpoints/bpRecipies';
import { IBPRecipieStatus } from '../internal/breakpoints/bpRecipieStatus';
import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { BPRecipie, BPRecipieInLoadedSource } from '../internal/breakpoints/bpRecipie';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../internal/locations/location';
import { ConditionalBreak, AlwaysBreak } from '../internal/breakpoints/bpActionWhenHit';
import { IBreakpoint } from '../internal/breakpoints/breakpoint';
import { registerChannels } from './channel';
import { PausedEvent } from '../target/events';
import { PossibleAction } from '../internal/features/takeProperActionOnPausedEvent';

const _breakpoints = {
    // Notifications
    OnUnbounBPRecipieIsNowBound: new NotificationChannelIdentifier<BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),
    OnPausedOnBreakpoint: new NotificationChannelIdentifier<PausedEvent>(),
    OnNoPendingBreakpoints: new NotificationChannelIdentifier<void>(),

    AskForInformationAboutPaused: new NotificationChannelIdentifier<PausedEvent, PossibleAction>(),

    // Requests
    UpdateBreakpointsForFile: new RequestChannelIdentifier<BPRecipiesInUnresolvedSource, IBPRecipieStatus[]>(),
    AddBreakpointForLoadedSource: new RequestChannelIdentifier<BPRecipieInLoadedSource<ConditionalBreak | AlwaysBreak>, IBreakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>[]>(),
};

const Breakpoints: Readonly<typeof _breakpoints> = _breakpoints;

const _Internal = {
    AskForInformationAboutPaused: new NotificationChannelIdentifier<PausedEvent, PossibleAction>(),
    Breakpoints
};

export const Internal: Readonly<typeof _Internal> = _Internal;

registerChannels(Internal, 'Internal');
