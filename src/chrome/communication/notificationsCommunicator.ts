import { ValidatedMap } from '../collections/validatedMap';
import { ChannelIdentifier } from './channelIdentifier';
import { getChannelName } from './channel';
import { Listeners } from './listeners';

export type NotificationListener<Notification> = (notification: Notification) => Promise<void> | void;
export type PublisherFunction<Notification> = (notification: Notification) => Promise<void>;

// We need the template parameter to force the Communicator to be "strongly typed" from the client perspective
export class NotificationChannelIdentifier<_Notification> implements ChannelIdentifier {
    constructor(public readonly identifierSymbol: Symbol = Symbol()) { }

    public toString(): string {
        return getChannelName(this);
    }
}

class NotificationChannel<Notification> {
    public readonly listeners = new Listeners<Notification, Promise<void> | void>();
    public readonly publisher: Publisher<Notification> = new Publisher<Notification>(this);
}

export class Publisher<Notification> {
    constructor(private readonly notificationChannel: NotificationChannel<Notification>) { }

    public async publish(notification: Notification): Promise<void> {
        await Promise.all(this.notificationChannel.listeners.call(notification));
    }
}

export class NotificationsCommunicator {
    private readonly _identifierToChannel = new ValidatedMap<NotificationChannelIdentifier<any>, NotificationChannel<any>>();

    public getPublisher<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): PublisherFunction<Notification> {
        const publisher = this.getChannel(notificationChannelIdentifier).publisher;
        return notification => publisher.publish(notification);
    }

    public subscribe<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>, listener: (notification: Notification) => void): void {
        this.getChannel(notificationChannelIdentifier).listeners.add(listener);
    }

    private getChannel<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): NotificationChannel<Notification> {
        return this._identifierToChannel.getOrAdd(notificationChannelIdentifier, () => new NotificationChannel<Notification>());
    }
}
