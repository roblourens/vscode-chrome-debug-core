import { OutputParameters, SourceWasLoadedParameters, BPStatusChangedParameters, DebugeeIsStoppedParameters } from '../client/eventSender';
import { RequestChannelIdentifier } from './requestsCommunicator';
import { registerChannels } from './channel';

const _eventSender = {
    // Notifications
    // OnBreakpointResolved: new NotificationChannelIdentifier<Breakpoint<ScriptOrSourceOrIdentifierOrUrlRegexp>>(),

    // Requests
    SendOutput: new RequestChannelIdentifier<OutputParameters, void>(),
    SendSourceWasLoaded: new RequestChannelIdentifier<SourceWasLoadedParameters, void>(),
    SendBPStatusChanged: new RequestChannelIdentifier<BPStatusChangedParameters, void>(),
    SendDebugeeIsStopped: new RequestChannelIdentifier<DebugeeIsStoppedParameters, void>(),
};

const EventSender: Readonly<typeof _eventSender> = _eventSender;

const _Client = {
    EventSender
};

export const Client: Readonly<typeof _Client> = _Client;

registerChannels(Client, 'Client');
