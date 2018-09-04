import { Handles } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { utils, LineColTransformer } from '../..';
import * as pathModule from 'path';
import { asyncAdaptToSinglIntoToMulti } from '../../utils';
import { CallFramePresentation, CallFramePresentationOrLabel, StackTraceLabel } from '../internal/stackTraces';
import { ILoadedSource, ILoadedSourceTreeNode } from '../internal/loadedSource';
import { LocationInLoadedSource } from '../internal/locationInResource';
import { Source } from 'vscode-debugadapter';
import { RemoveProperty } from '../../typeUtils';
import { IBPRecipieStatus } from '../internal/breakpoints/bpRecipieStatus';

interface ClientLocationInSource {
    source: DebugProtocol.Source;
    line: number;
    column: number;
}

export class InternalToClient {
    // V1 reseted the frames on an onPaused event. Figure out if that is the right thing to do
    private readonly _frameHandles = new Handles<CallFramePresentationOrLabel<ILoadedSource>>();

    public readonly toStackFrames = asyncAdaptToSinglIntoToMulti((s: CallFramePresentationOrLabel<ILoadedSource>) => this.toStackFrame(s));
    public readonly toSourceTrees = asyncAdaptToSinglIntoToMulti((s: ILoadedSourceTreeNode) => this.toSourceTree(s));
    public readonly toBPRecipiesStatus = asyncAdaptToSinglIntoToMulti((s: IBPRecipieStatus) => this.toBPRecipieStatus(s));

    constructor(
        private readonly _lineColTransformer: NonNullable<LineColTransformer>,
        private readonly _sourceHandles: Handles<ILoadedSource>) {

    }

    public async toStackFrame(stackFrame: CallFramePresentationOrLabel<ILoadedSource>): Promise<DebugProtocol.StackFrame> {
        if (stackFrame instanceof CallFramePresentation) {
            const vsStackFrame: RemoveProperty<DebugProtocol.StackFrame, 'line' | 'column'> = {
                id: this._frameHandles.create(stackFrame),
                name: stackFrame.name,
                presentationHint: stackFrame.presentationHint
            };

            const result = await this.toLocationInSource(stackFrame.location, vsStackFrame);
            return result;
        } else if (stackFrame instanceof StackTraceLabel) {
            return {
                id: this._frameHandles.create(stackFrame),
                name: `[${stackFrame.description}]`,
                presentationHint: 'label'
            } as DebugProtocol.StackFrame;
        } else {
            throw new Error(`Expected stack frames to be either call frame presentations or label frames, yet it was: ${stackFrame}`);
        }
    }

    public getFrameById(frameId: number): CallFramePresentationOrLabel<ILoadedSource> {
        // TODO DIEGO: Add better error checking
        return this._frameHandles.get(frameId);
    }

    private toSourceLeafs(sources: ILoadedSourceTreeNode[]): Promise<DebugProtocol.Source[]> {
        return Promise.all(sources.map(source => this.toSourceTree(source)));
    }

    public async toSourceTree(sourceMetadata: ILoadedSourceTreeNode): Promise<DebugProtocol.Source> {
        const source = await this.toSource(sourceMetadata.mainSource);
        (source as any).sources = await this.toSourceLeafs(sourceMetadata.relatedSources);
        return source;
    }

    public async toSource(loadedSource: ILoadedSource): Promise<Source> {
        const exists = await utils.existsAsync(loadedSource.identifier.canonicalized);

        // if the path exists, do not send the sourceReference
        const source = new Source(
            pathModule.basename(loadedSource.identifier.textRepresentation),
            loadedSource.identifier.textRepresentation,
            exists ? undefined : this._sourceHandles.create(loadedSource));

        return source;
    }

    public async toLocationInSource<T = {}>(locationInSource: LocationInLoadedSource, objectToUpdate: T): Promise<T & ClientLocationInSource> {
        const source = await this.toSource(locationInSource.source);
        const clientLocationInSource = { source, line: locationInSource.lineNumber, column: locationInSource.columnNumber };
        this._lineColTransformer.convertDebuggerLocationToClient(clientLocationInSource);
        return Object.assign(objectToUpdate, clientLocationInSource);
    }

    public async toBPRecipieStatus(bpRecipieStatus: IBPRecipieStatus): Promise<DebugProtocol.Breakpoint> {
        const clientStatus = {
            verified: bpRecipieStatus.isVerified(),
            message: bpRecipieStatus.statusDescription
        };

        if (bpRecipieStatus.isBinded()) {
            await this.toLocationInSource(bpRecipieStatus.actualLocationInSource, clientStatus);
        }

        return clientStatus;
    }
}