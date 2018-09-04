/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { DebugProtocol } from 'vscode-debugprotocol';

import { ILaunchRequestArgs, IAttachRequestArgs,
    ISetBreakpointsResponseBody, IScopesResponseBody } from '../debugAdapterInterfaces';
import { MappedPosition, ISourcePathDetails, SourceMap } from '../sourceMaps/sourceMap';
import { SourceMaps } from '../sourceMaps/sourceMaps';
import { logger } from 'vscode-debugadapter';

import { ILoadedSource } from '../chrome/internal/loadedSource';
import { INewSetBreakpointsArgs } from '../chrome/internal/breakpoints';

interface ISavedSetBreakpointsArgs {
    generatedPath: string;
    authoredPath: string;
    originalBPs: DebugProtocol.Breakpoint[];
}

export interface ISourceLocation {
    source: ILoadedSource;
    line: number;
    column: number;
    isSourceMapped?: boolean; // compat with stack frame
}

/**
 * If sourcemaps are enabled, converts from source files on the client side to runtime files on the target side
 */
export class BaseSourceMapTransformer {
    protected _sourceMaps: SourceMaps;
    private _enableSourceMapCaching: boolean;

    private _requestSeqToSetBreakpointsArgs: Map<number, ISavedSetBreakpointsArgs>;
    private _allRuntimeScriptPaths: Set<string>;
    private _authoredPathsToMappedBPs: Map<string, DebugProtocol.SourceBreakpoint[]>;
    private _authoredPathsToClientBreakpointIds: Map<string, number[]>;

    protected _preLoad = Promise.resolve();
    private _processingNewSourceMap: Promise<any> = Promise.resolve();

    public caseSensitivePaths: boolean;

    protected _isVSClient = false;

    constructor(enableSourceMapCaching?: boolean) {
        this._enableSourceMapCaching = enableSourceMapCaching;
    }

    public get sourceMaps(): SourceMaps {
        return this._sourceMaps;
    }

    public set isVSClient(newValue: boolean) {
        this._isVSClient = newValue;
    }

    public launch(args: ILaunchRequestArgs): void {
        this.init(args);
    }

    public attach(args: IAttachRequestArgs): void {
        this.init(args);
    }

    protected init(args: ILaunchRequestArgs | IAttachRequestArgs): void {
        if (args.sourceMaps) {
            this._sourceMaps = new SourceMaps(args.pathMapping, args.sourceMapPathOverrides, this._enableSourceMapCaching);
            this._requestSeqToSetBreakpointsArgs = new Map<number, ISavedSetBreakpointsArgs>();
            this._allRuntimeScriptPaths = new Set<string>();
            this._authoredPathsToMappedBPs = new Map<string, DebugProtocol.SourceBreakpoint[]>();
            this._authoredPathsToClientBreakpointIds = new Map<string, number[]>();
        }
    }

    public clearTargetContext(): void {
        this._allRuntimeScriptPaths = new Set<string>();
    }

    /**
     * Apply sourcemapping to the setBreakpoints request path/lines.
     * Returns true if completed successfully, and setBreakpoint should continue.
     */
    public setBreakpoints(args: INewSetBreakpointsArgs, requestSeq: number, ids?: number[]): { args: INewSetBreakpointsArgs, ids: number[] } {
        if (!this._sourceMaps) {
            return { args, ids };
        }

        const originalBPs = JSON.parse(JSON.stringify(args.breakpoints));

        if (args.source.identifier.textRepresentation) {
            const argsPath = args.source.identifier.textRepresentation;
            args.source.tryGettingLoadedSource(loadedSource => {
                const mappedPath = loadedSource.script.runtimeSource.identifier.textRepresentation;
                logger.log(`SourceMaps.setBP: Mapped ${argsPath} to ${mappedPath}`);
                args.authoredPath = argsPath;

                // DebugProtocol doesn't send cols yet, but they need to be added from sourcemaps
                args.breakpoints.forEach(bp => {
                    const { line, column = 0 } = bp;
                    const mapped = this._sourceMaps.mapToGenerated(argsPath, line, column);
                    if (mapped) {
                        logger.log(`SourceMaps.setBP: Mapped ${argsPath}:${line + 1}:${column + 1} to ${mappedPath}:${mapped.line + 1}:${mapped.column + 1}`);
                        bp.line = mapped.line;
                        bp.column = mapped.column;
                    } else {
                        logger.log(`SourceMaps.setBP: Mapped ${argsPath} but not line ${line + 1}, column 1`);
                        bp.column = column; // take 0 default if needed
                    }
                });

                this._authoredPathsToMappedBPs.set(argsPath, args.breakpoints);

                // Store the client breakpoint Ids for the mapped BPs as well
                if (ids) {
                    this._authoredPathsToClientBreakpointIds.set(argsPath, ids);
                }

                // Include BPs from other files that map to the same file. Ensure the current file's breakpoints go first
                this._sourceMaps.allMappedSources(mappedPath).forEach(sourcePath => {
                    if (sourcePath === argsPath) {
                        return;
                    }

                    const sourceBPs = this._authoredPathsToMappedBPs.get(sourcePath);
                    if (sourceBPs) {
                        // Don't modify the cached array
                        args.breakpoints = args.breakpoints.concat(sourceBPs);

                        // We need to assign the client IDs we generated for the mapped breakpoints becuase the runtime IDs may change
                        // So make sure we concat the client ids to the ids array so that they get mapped to the respective breakpoints later
                        const clientBreakpointIds = this._authoredPathsToClientBreakpointIds.get(sourcePath);
                        if (ids) {
                            ids = ids.concat(clientBreakpointIds);
                        }
                    }
                });
            }, _identifier => {
                if (this.isRuntimeScript(argsPath)) {
                    // It's a generated file which is loaded
                    logger.log(`SourceMaps.setBP: SourceMaps are enabled but ${argsPath} is a runtime script`);
                } else {
                    // Source (or generated) file which is not loaded.
                    logger.log(`SourceMaps.setBP: ${argsPath} can't be resolved to a loaded script. It may just not be loaded yet.`);
                }
                });
        } else {
            // No source.path
        }

        this._requestSeqToSetBreakpointsArgs.set(requestSeq, {
            originalBPs,
            authoredPath: args.authoredPath,
            generatedPath: args.source.identifier.textRepresentation
        });

        return { args, ids };
    }

    /**
     * Apply sourcemapping back to authored files from the response
     */
    public setBreakpointsResponse(response: ISetBreakpointsResponseBody, requestSeq: number): void {
        if (this._sourceMaps && this._requestSeqToSetBreakpointsArgs.has(requestSeq)) {
            const args = this._requestSeqToSetBreakpointsArgs.get(requestSeq);
            if (args.authoredPath) {
                // authoredPath is set, so the file was mapped to source.
                // Remove breakpoints from files that map to the same file, and map back to source.
                response.breakpoints = response.breakpoints.filter((_, i) => i < args.originalBPs.length);
                response.breakpoints.forEach((bp, i) => {
                    const mapped = this._sourceMaps.mapToAuthored(args.generatedPath, bp.line, bp.column);
                    if (mapped) {
                        logger.log(`SourceMaps.setBP: Mapped ${args.generatedPath}:${bp.line + 1}:${bp.column + 1} to ${mapped.source}:${mapped.line + 1}`);
                        bp.line = mapped.line;
                        bp.column = mapped.column;
                    } else {
                        logger.log(`SourceMaps.setBP: Can't map ${args.generatedPath}:${bp.line + 1}:${bp.column + 1}, keeping original line numbers.`);
                        bp.line = args.originalBPs[i].line;
                        bp.column = args.originalBPs[i].column;
                    }

                    this._requestSeqToSetBreakpointsArgs.delete(requestSeq);
                });
            }
        }
    }

    public async scriptParsed(pathToGenerated: string, sourceMapURL: string | undefined): Promise<SourceMap> {
        if (this._sourceMaps) {
            this._allRuntimeScriptPaths.add(this.fixPathCasing(pathToGenerated));

            if (!sourceMapURL) return null;

            // Load the sourcemap for this new script and log its sources
            const processNewSourceMapP = this._sourceMaps.processNewSourceMap(pathToGenerated, sourceMapURL, this._isVSClient);
            this._processingNewSourceMap = Promise.all([this._processingNewSourceMap, processNewSourceMapP]);
            await processNewSourceMapP;

            const sources = this._sourceMaps.allMappedSources(pathToGenerated);
            if (sources) {
                logger.log(`SourceMaps.scriptParsed: ${pathToGenerated} was just loaded and has mapped sources: ${JSON.stringify(sources) }`);
            }

            return processNewSourceMapP;
        } else {
            return null;
        }
    }

    public breakpointResolved(bp: DebugProtocol.Breakpoint, scriptPath: string): void {
        if (this._sourceMaps) {
            const mapped = this._sourceMaps.mapToAuthored(scriptPath, bp.line, bp.column);
            if (mapped) {
                // No need to send back the path, the bp can only move within its script
                bp.line = mapped.line;
                bp.column = mapped.column;
            }
        }
    }

    public scopesResponse(pathToGenerated: string, scopesResponse: IScopesResponseBody): void {
        if (this._sourceMaps) {
            scopesResponse.scopes.forEach(scope => this.mapScopeLocations(pathToGenerated, scope));
        }
    }

    private mapScopeLocations(pathToGenerated: string, scope: DebugProtocol.Scope): void {
        // The runtime can return invalid scope locations. Just skip those scopes. https://github.com/Microsoft/vscode-chrome-debug-core/issues/333
        if (typeof scope.line !== 'number' || scope.line < 0 || scope.endLine < 0 || scope.column < 0 || scope.endColumn < 0) {
            return;
        }

        let mappedStart = this._sourceMaps.mapToAuthored(pathToGenerated, scope.line, scope.column);
        let shiftedScopeStartForward = false;

        // If the scope is an async function, then the function declaration line may be missing a source mapping.
        // So if we failed, try to get the next line.
        if (!mappedStart) {
            mappedStart = this._sourceMaps.mapToAuthored(pathToGenerated, scope.line + 1, scope.column);
            shiftedScopeStartForward = true;
        }

        if (mappedStart) {
            // Only apply changes if both mappings are found
            const mappedEnd = this._sourceMaps.mapToAuthored(pathToGenerated, scope.endLine, scope.endColumn);
            if (mappedEnd) {
                scope.line = mappedStart.line;
                if (shiftedScopeStartForward) {
                    scope.line--;
                }
                scope.column = mappedStart.column;

                scope.endLine = mappedEnd.line;
                scope.endColumn = mappedEnd.column;
            }
        }
    }

    public async mapToGenerated(authoredPath: string, line: number, column: number): Promise<MappedPosition> {
        if (!this._sourceMaps) return null;

        await this.wait();
        return this._sourceMaps.mapToGenerated(authoredPath, line, column);
    }

    public async mapToAuthored(pathToGenerated: string, line: number, column: number): Promise<MappedPosition> {
        if (!this._sourceMaps) return null;

        await this.wait();
        return this._sourceMaps.mapToAuthored(pathToGenerated, line, column);
    }

    public async getGeneratedPathFromAuthoredPath(authoredPath: string): Promise<string> {
        if (!this._sourceMaps) return authoredPath;

        await this.wait();

        // Find the generated path, or check whether this script is actually a runtime path - if so, return that
        return this._sourceMaps.getGeneratedPathFromAuthoredPath(authoredPath) ||
            (this.isRuntimeScript(authoredPath) ? authoredPath : null);
    }

    public async allSources(pathToGenerated: string): Promise<string[]> {
        if (!this._sourceMaps) return [];

        await this.wait();
        return this._sourceMaps.allMappedSources(pathToGenerated) || [];
    }

    public async allSourcePathDetails(pathToGenerated: string): Promise<ISourcePathDetails[]> {
        if (!this._sourceMaps) return [];

        await this.wait();
        return this._sourceMaps.allSourcePathDetails(pathToGenerated) || [];
    }

    private wait(): Promise<any> {
        return Promise.all([this._preLoad, this._processingNewSourceMap]);
    }

    private isRuntimeScript(scriptPath: string): boolean {
        return this._allRuntimeScriptPaths.has(this.fixPathCasing(scriptPath));
    }

    private fixPathCasing(str: string): string {
        return str && (this.caseSensitivePaths ? str : str.toLowerCase());
    }
}
