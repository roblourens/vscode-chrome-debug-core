import { ValidatedMap } from '../collections/validatedMap';
import { ChannelIdentifier } from './channelIdentifier';
import { getChannelName } from './channel';

export type RequestHandler<Request, Response> =
    Request extends void
    ? () => Response :
    NonVoidRequestHandler<Request, Response>;

export type NonVoidRequestHandler<Request, Response> = (request: Request) => Response;

// We need the template parameter to force the Communicator to be "strongly typed" from the client perspective
export class RequestChannelIdentifier<_Request, _Response> implements ChannelIdentifier {
    constructor(public readonly identifierSymbol: Symbol = Symbol()) { }

    public toString(): string {
        return getChannelName(this);
    }
}

function noRequestHandler<Request, Response>(request: Request): Response {
    throw new Error(`Can't execute request <${request}> because no handler has yet registered to handle this kind of requests`);
}

class RequestChannel<Request, Response> {
    public readonly requester: Requester<Request, Response> = new Requester<Request, Response>(this);
    public handler: RequestHandler<Request, Response> = noRequestHandler as RequestHandler<Request, Response>;
}

export class Requester<Request, Response> {
    constructor(private readonly _requestChannel: RequestChannel<Request, Response>) { }

    public request(request: Request): Response {
        return (this._requestChannel.handler as NonVoidRequestHandler<Request, Response>)(request);
    }
}

export class RequestsCommunicator {
    private readonly _identifierToChannel = new ValidatedMap<RequestChannelIdentifier<any, any>, RequestChannel<any, any>>();

    public registerHandler<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>,
        handler: (request: Request) => Response): void {
        const existingHandler = this.getChannel(requestChannelIdentifier).handler;
        if (existingHandler === noRequestHandler) {
            this.getChannel(requestChannelIdentifier).handler = handler as RequestHandler<Request, Response>;
        } else {
            throw new Error(`Can't register a handler for ${requestChannelIdentifier} because a handler has already been registered (${existingHandler})`);
        }
    }

    public getRequester<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>): RequestHandler<Request, Response> {
        const requester = this.getChannel(requestChannelIdentifier).requester;
        return ((request: Request) => requester.request(request)) as RequestHandler<Request, Response>;
    }

    private getChannel<Request, Response>(requestChannelIdentifier: RequestChannelIdentifier<Request, Response>): RequestChannel<Request, Response> {
        return this._identifierToChannel.getOrAdd(requestChannelIdentifier, () => new RequestChannel<Request, Response>());
    }
}
