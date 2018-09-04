import { RequestChannelIdentifier } from './requestsCommunicator';
import { BPRecipiesInUnbindedSource } from '../internal/breakpoints/bpRecipies';
import { IBPRecipieStatus } from '../internal/breakpoints/bpRecipieStatus';
import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { BPRecipie } from '../internal/breakpoints/bpRecipie';
import { ScriptOrSourceOrIdentifierOrUrlRegexp } from '../internal/locationInResource';

const _breakpoints = {
    // Notifications
    OnUnbounBPRecipieIsNowBound: new NotificationChannelIdentifier<BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),

    // Requests
    SetBreakpoints: new RequestChannelIdentifier<BPRecipiesInUnbindedSource, Promise<IBPRecipieStatus[]>>(),
};

const Breakpoints: Readonly<typeof _breakpoints> = _breakpoints;

const _Internal = {
    Breakpoints
};

export const Internal: Readonly<typeof _Internal> = _Internal;
