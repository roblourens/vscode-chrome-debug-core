/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { DebugProtocol } from 'vscode-debugprotocol';

import { ILaunchRequestArgs, IAttachRequestArgs } from '../debugAdapterInterfaces';
import { IResourceIdentifier } from '../chrome/internal/resourceIdentifier';
import { INewSetBreakpointsArgs } from '../chrome/internal/breakpoints/breakpointRecipie';
import { StackTracePresentation } from '../chrome/internal/stackTraces';

/**
 * Converts a local path from Code to a path on the target.
 */
export class BasePathTransformer {
    public launch(_args: ILaunchRequestArgs): Promise<void> {
        return Promise.resolve();
    }

    public attach(_args: IAttachRequestArgs): Promise<void> {
        return Promise.resolve();
    }

    public setBreakpoints(args: INewSetBreakpointsArgs): INewSetBreakpointsArgs {
        return args;
    }

    public clearTargetContext(): void {
    }

    public scriptParsed(scriptPath: IResourceIdentifier): Promise<IResourceIdentifier> {
        return Promise.resolve(scriptPath);
    }

    public breakpointResolved(_bp: DebugProtocol.Breakpoint, targetPath: IResourceIdentifier): IResourceIdentifier {
        return this.getClientPathFromTargetPath(targetPath) || targetPath;
    }

    public stackTraceResponse(_response: StackTracePresentation): void {
    }

    public async fixSource(_source: DebugProtocol.Source): Promise<void> {
    }

    public getTargetPathFromClientPath(clientPath: IResourceIdentifier): IResourceIdentifier {
        return clientPath;
    }

    public getClientPathFromTargetPath(targetPath: IResourceIdentifier): IResourceIdentifier {
        return targetPath;
    }
}
