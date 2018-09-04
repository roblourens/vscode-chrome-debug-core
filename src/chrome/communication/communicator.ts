import { NotificationsCommunicator, NotificationChannelIdentifier, PublisherFunction, SubscriberFunction } from './notificationsCommunicator';
import { RequestsCommunicator, RequestChannelIdentifier, RequestHandlerCallback } from './requestsCommunicator';

export class Communicator {
    private readonly _notificationsCommunicator = new NotificationsCommunicator();
    private readonly _requestsCommunicator = new RequestsCommunicator();

    public getPublisher<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): PublisherFunction<Notification> {
        return this._notificationsCommunicator.getPublisher(notificationChannelIdentifier);
    }

    public getSubscriber<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): SubscriberFunction<Notification> {
        return this._notificationsCommunicator.getSubscriber(notificationChannelIdentifier);
    }

    public subscribe<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>, listener: (notification: Notification) => void): void {
        return this._notificationsCommunicator.subscribe(notificationChannelIdentifier, listener);
    }

    public registerHandler<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>, handler: (request: Request) => Response): void {
        this._requestsCommunicator.registerHandler(requestChannelIdentifier, handler);
    }

    public getRequester<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>): RequestHandlerCallback<Request, Response> {
        return this._requestsCommunicator.getRequester(requestChannelIdentifier);
    }
}
