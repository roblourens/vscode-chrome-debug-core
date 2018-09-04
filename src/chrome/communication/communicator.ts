import { NotificationsCommunicator, NotificationChannelIdentifier, PublisherFunction } from './notificationsCommunicator';
import { RequestsCommunicator, RequestChannelIdentifier, RequestHandler } from './requestsCommunicator';

export class Communicator {
    private readonly _notificationsCommunicator = new NotificationsCommunicator();
    private readonly _requestsCommunicator = new RequestsCommunicator();

    public getPublisher<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>): PublisherFunction<Notification> {
        return this._notificationsCommunicator.getPublisher(notificationChannelIdentifier);
    }

    public subscribe<Notification>(notificationChannelIdentifier: NotificationChannelIdentifier<Notification>, listener: (notification: Notification) => void): void {
        return this._notificationsCommunicator.subscribe(notificationChannelIdentifier, listener);
    }

    public registerHandler<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>, handler: (request: Request) => Response): void {
        this._requestsCommunicator.registerHandler(requestChannelIdentifier, handler);
    }

    public getRequester<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>): RequestHandler<Request, Response> {
        return this._requestsCommunicator.getRequester(requestChannelIdentifier);
    }
}
