import { ValidatedMap } from '../collections/validatedMap';
import { asyncMap } from '../collections/async';

export type NotificationListener<Notification> = (notification: Notification) => Promise<void> | void;
export type PublisherFunction<Notification> = (notification: Notification) => Promise<void>;

// We need the template parameter to force the Communicator to be "strongly typed" from the client perspective
export class NotificationChannelIdentifier<_Notification> {
    constructor(public readonly identifierSymbol: Symbol = Symbol()) { }
}

class NotificationChannel<Notification> {
    public readonly listeners: NotificationListener<Notification>[] = [];
    public readonly publisher: Publisher<Notification> = new Publisher<Notification>(this);
}

export class Publisher<Notification> {
    constructor(private readonly notificationChannel: NotificationChannel<Notification>) { }

    public async publish(notification: Notification): Promise<void> {
        await asyncMap(this.notificationChannel.listeners, listener => listener(notification));
    }
}

export class NotificationsCommunicator {
    private readonly _identifierToChannel = new ValidatedMap<NotificationChannelIdentifier<any>, NotificationChannel<any>>();

    public getPublisher<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): PublisherFunction<Notification> {
        const publisher = this.getChannel(notificationChannelIdentifier).publisher;
        return notification => publisher.publish(notification);
    }

    public subscribe<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>, listener: (notification: Notification) => void): void {
        this.getChannel(notificationChannelIdentifier).listeners.push(listener);
    }

    private getChannel<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): NotificationChannel<Notification> {
        return this._identifierToChannel.getOrAdd(notificationChannelIdentifier, () => new NotificationChannel<Notification>());
    }
}
