import { DebugProtocol } from 'vscode-debugprotocol';
import { InitializedEvent } from 'vscode-debugadapter';

export interface ISession {
    sendEvent(event: DebugProtocol.Event): void;
    shutdown(): void;
    sendRequest(command: string, args: any, timeout: number, cb: (response: DebugProtocol.Response) => void): void;
}

export class DelayMessagesUntilInitializedSession implements ISession {
    private _hasSentInitializedMessage = false;
    private _eventsWaitingInitialization: DebugProtocol.Event[] = [];

    constructor(private readonly _wrappedSession: ISession) {

    }

    public sendRequest(command: string, args: any, timeout: number, cb: (response: DebugProtocol.Response) => void): void {
        this._wrappedSession.sendRequest(command, args, timeout, cb);
    }

    public convertClientLineToDebugger(line: number): number {
        // LineColTransformer uses this private method from the session
        return (this._wrappedSession as any).convertClientLineToDebugger(line);
    }

    public convertDebuggerLineToClient(line: number): number {
        // LineColTransformer uses this private method from the session
        return (this._wrappedSession as any).convertDebuggerLineToClient(line);
    }

    public convertDebuggerColumnToClient(line: number): number {
        // LineColTransformer uses this private method from the session
        return (this._wrappedSession as any).convertDebuggerColumnToClient(line);
    }

    public sendEvent(event: DebugProtocol.Event): void {
        if (this._hasSentInitializedMessage) {
            this._wrappedSession.sendEvent(event);
        } else if (event instanceof InitializedEvent) {
            this._wrappedSession.sendEvent(event);
            this._hasSentInitializedMessage = true;
            this._eventsWaitingInitialization.forEach(storedEvent =>
                this._wrappedSession.sendEvent(storedEvent));
            this._eventsWaitingInitialization = [];
        } else {
            this._eventsWaitingInitialization.push(event);
        }
    }

    public shutdown(): void {
        this._wrappedSession.shutdown();
    }
}