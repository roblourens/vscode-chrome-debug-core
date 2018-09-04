import { ILoadedSource } from '../internal/loadedSource';
import { IBPRecipie } from '../internal/breakpoints/bpRecipie';
import { BidirectionalMap } from '../collections/bidirectionalMap';
import { FramePresentationOrLabel } from '../internal/stackTraces/stackTracePresentation';

export class BidirectionalHandles<T> {
    private readonly _idToObject = new BidirectionalMap<number, T>();

    public getObjectById(id: number): T {
        return this._idToObject.getByLeft(id);
    }

    public getIdByObject(obj: T): number {
        const id = this._idToObject.tryGettingByRight(obj);
        if (id !== undefined) {
            return id;
        } else {
            const newId = this._nextHandle++;
            this._idToObject.set(newId, obj);
            return newId;
        }
    }

    constructor(private _nextHandle: number) { }

    public toString(): string {
        return this._idToObject.toString();
    }
}

const prefixMultiplier = 1000000;

export class HandlesRegistry {
    // V1 reseted the frames on an onPaused event. Figure out if that is the right thing to do
    public readonly breakpoints = new BidirectionalHandles<IBPRecipie<ILoadedSource<string>>>(888 * prefixMultiplier);
    public readonly frames = new BidirectionalHandles<FramePresentationOrLabel<ILoadedSource>>(123 * prefixMultiplier);
    public readonly sources = new BidirectionalHandles<ILoadedSource>(555 * prefixMultiplier);

    public toString(): string {
        return `breakpoints: ${this.breakpoints}\nframes: ${this.frames}\nsources: ${this.sources}`;
    }
}
