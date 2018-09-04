import { LocationInScript, ScriptOrSourceOrIdentifierOrUrlRegexp } from '../locationInResource';
import { IScript } from '../script';
import { BreakpointRecipie, URLRegexp } from './breakpointRecipie';
import { IResourceIdentifier } from '../resourceIdentifier';
import { ILoadedSource } from '../loadedSource';

export interface IBreakpoint<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> {
    recipie: BreakpointRecipie<TResource>;
    actualLocation: LocationInScript;
}

export abstract class BreakpointCommonLogic<TResource extends ScriptOrSourceOrIdentifierOrUrlRegexp> implements IBreakpoint<TResource>{
    constructor(public readonly recipie: BreakpointRecipie<TResource>, public readonly actualLocation: LocationInScript) { }
}

export class BreakpointInLoadedSource extends BreakpointCommonLogic<ILoadedSource> {

}

export class BreakpointInScript extends BreakpointCommonLogic<IScript> {

}

export class BreakpointInUrl extends BreakpointCommonLogic<IResourceIdentifier> {

}

export class BreakpointInUrlRegexp extends BreakpointCommonLogic<URLRegexp> {

}

export type Breakpoint<TResource> =
    TResource extends ILoadedSource ? BreakpointInLoadedSource :
    TResource extends IScript ? BreakpointInScript :
    TResource extends IResourceIdentifier ? BreakpointInUrl :
    TResource extends URLRegexp ? BreakpointInUrlRegexp :
    never;
