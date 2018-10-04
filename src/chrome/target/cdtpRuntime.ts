import { Crdp } from '../..';
import { CDTPDiagnosticsModule } from './cdtpDiagnosticsModule';
import { ExceptionThrownEvent, ConsoleAPICalledEvent } from './events';
import { TargetToInternal } from './targetToInternal';
import { InternalToTarget } from './internalToTarget';
import { IExecutionContext } from '../internal/scripts/executionContext';

type RuntimeListener = ((params: Crdp.Runtime.ConsoleAPICalledEvent) => void)
    | ((params: Crdp.Runtime.ExceptionThrownEvent) => void)
    | ((params: Crdp.Runtime.ExecutionContextCreatedEvent) => void)
    | (() => void);

export class CDTPRuntime extends CDTPDiagnosticsModule<Crdp.RuntimeApi> {
    public on(event: 'consoleAPICalled', listener: (params: Crdp.Runtime.ConsoleAPICalledEvent) => void): void;
    public on(event: 'exceptionThrown', listener: (params: Crdp.Runtime.ExceptionThrownEvent) => void): void;
    public on(event: 'executionContextsCleared', listener: () => void): void;
    public on(event: 'consoleAPICalled' | 'exceptionThrown' | 'executionContextsCleared', listener: RuntimeListener): void {
        return this.api.on(event as any, listener as any);
    }

    public onExecutionContextDestroyed(listener: (executionContext: IExecutionContext) => void): void {
        return this.api.on('executionContextDestroyed', async params => {
            return listener(this._crdpToInternal.markExecutionContextAsDestroyed(params.executionContextId));
        });
    }

    public onExecutionContextCreated(listener: (executionContext: IExecutionContext) => void): void {
        return this.api.on('executionContextCreated', async params => {
            return listener(this._crdpToInternal.toNewExecutionContext(params.context.id));
        });
    }

    public onExceptionThrown(listener: (params: ExceptionThrownEvent) => void): void {
        return this.api.on('exceptionThrown', async params => {
            listener({
                timestamp: params.timestamp,
                exceptionDetails: await this._crdpToInternal.toExceptionDetails(params.exceptionDetails)
            });
        });
    }

    public onConsoleAPICalled(listener: (params: ConsoleAPICalledEvent) => void): void {
        return this.api.on('consoleAPICalled', async params => {
            listener({
                args: params.args, context: params.context, executionContextId: params.executionContextId,
                stackTrace: params.stackTrace && await this._crdpToInternal.toStackTraceCodeFlow(params.stackTrace), timestamp: params.timestamp, type: params.type
            });
        });
    }

    public enable(): Promise<void> {
        return this.api.enable();
    }

    public callFunctionOn(params: Crdp.Runtime.CallFunctionOnRequest): Promise<Crdp.Runtime.CallFunctionOnResponse> {
        return this.api.callFunctionOn(params);
    }

    public getProperties(params: Crdp.Runtime.GetPropertiesRequest): Promise<Crdp.Runtime.GetPropertiesResponse> {
        return this.api.getProperties(params);
    }

    public evaluate(params: Crdp.Runtime.EvaluateRequest): Promise<Crdp.Runtime.EvaluateResponse> {
        params.expression = this._internalToTarget.addURLIfMissing(params.expression);
        return this.api.evaluate(params);
    }

    constructor(
        apiGetter: () => Crdp.RuntimeApi,
        private readonly _crdpToInternal: TargetToInternal,
        private readonly _internalToTarget: InternalToTarget) {
        super(apiGetter);
    }
}
