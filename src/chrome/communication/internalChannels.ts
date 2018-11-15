import { NotificationChannelIdentifier } from './notificationsCommunicator';
import { BPRecipie } from '../internal/breakpoints/bpRecipie';
import { ScriptOrSourceOrIdentifierOrUrlRegexp, LocationInLoadedSource } from '../internal/locations/location';
import { registerChannels } from './channel';
import { PausedEvent } from '../target/events';
import { ICallFramePresentationDetails } from '../internal/stackTraces/callFramePresentation';
import { Vote } from './collaborativeDecision';

const _breakpoints = {
    // Notifications
    OnUnbounBPRecipieIsNowBound: new NotificationChannelIdentifier<BPRecipie<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),
    OnPausedOnBreakpoint: new NotificationChannelIdentifier<PausedEvent>(),
    OnNoPendingBreakpoints: new NotificationChannelIdentifier<void>(),

    VoteForWhatToDoOnPaused: new NotificationChannelIdentifier<PausedEvent, Vote<void>>(),
};

const Breakpoints: Readonly<typeof _breakpoints> = _breakpoints;

const _Internal = {
    AskForInformationAboutPaused: new NotificationChannelIdentifier<PausedEvent, Vote<void>>(),
    CallFrameAdditionalPresentationDetailsElection: new NotificationChannelIdentifier<LocationInLoadedSource, Vote<ICallFramePresentationDetails>>(),
    Breakpoints,
};

export const Internal: Readonly<typeof _Internal> = _Internal;

registerChannels(Internal, 'Internal');
