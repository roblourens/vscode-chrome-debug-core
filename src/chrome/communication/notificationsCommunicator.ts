import { ValidatedMap } from '../collections/validatedMap';
import { ChannelIdentifier } from './channelIdentifier';
import { getChannelName } from './channel';
import { Listeners } from './listeners';

type ResponsesArray<T> = T extends void
    ? void
    : T[];

export type NotificationListener<Notification, Response> = (notification: Notification) => Promise<Response> | Response;
export type PublisherFunction<Notification, Response> = Notification extends void
    ? () => Promise<ResponsesArray<Response>>
    : (notification: Notification) => Promise<ResponsesArray<Response>>;
export type SubscriberFunction<Notification, Response> = (listener: NotificationListener<Notification, Response>) => void;

// We need the template parameter to force the Communicator to be "strongly typed" from the client perspective
export class NotificationChannelIdentifier<_Notification, _Response = void> implements ChannelIdentifier {
    [Symbol.toStringTag]: 'NotificationChannelIdentifier' = 'NotificationChannelIdentifier';

    constructor(public readonly identifierSymbol: Symbol = Symbol()) { }

    public toString(): string {
        return getChannelName(this);
    }
}

class NotificationChannel<Notification, Response> {
    public readonly listeners = new Listeners<Notification, Promise<Response> | Response>();
    public readonly publisher: Publisher<Notification, Response> = new Publisher<Notification, Response>(this);
}

export class Publisher<Notification, Response> {
    constructor(private readonly notificationChannel: NotificationChannel<Notification, Response>) { }

    public async publish(notification: Notification): Promise<Response[]> {
        return await Promise.all(this.notificationChannel.listeners.call(notification));
    }
}

export class NotificationsCommunicator {
    private readonly _identifierToChannel = new ValidatedMap<NotificationChannelIdentifier<any, any>, NotificationChannel<any, any>>();

    public getPublisher<Notification, Response>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification, Response>): PublisherFunction<Notification, Response> {
        const publisher = this.getChannel(notificationChannelIdentifier).publisher;
        return (notification => publisher.publish(notification)) as PublisherFunction<Notification, Response>;
    }

    public getSubscriber<Notification, Response>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification, Response>): SubscriberFunction<Notification, Response> {
        const channelListeners = this.getChannel(notificationChannelIdentifier).listeners;
        return listener => channelListeners.add(listener);
    }

    public subscribe<Notification, Response>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification, Response>, listener: (notification: Notification) => Response): void {
        this.getChannel(notificationChannelIdentifier).listeners.add(listener);
    }

    private getChannel<Notification, Response>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification, Response>): NotificationChannel<Notification, Response> {
        return this._identifierToChannel.getOrAdd(notificationChannelIdentifier, () => new NotificationChannel<Notification, Response>());
    }
}
