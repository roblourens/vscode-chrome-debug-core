import { ValidatedMap, IValidatedMap } from './validatedMap';
import { IProjection } from './setUsingProjection';

class KeyAndValue<K, V> {
    constructor(public readonly key: K, public readonly value: V) { }
}

export class MapUsingProjection<K, V, P> implements IValidatedMap<K, V> {
    private readonly _projectionToKeyAndvalue: IValidatedMap<P, KeyAndValue<K, V>>;

    constructor(private _projection: IProjection<K, P>, readonly initialContents: [K, V][] = []) {
        const entries = initialContents.map<[P, KeyAndValue<K, V>]>(pair => {
            const projected = this._projection(pair[0]);
            return [projected, new KeyAndValue(pair[0], pair[1])];
        });
        this._projectionToKeyAndvalue = new ValidatedMap<P, KeyAndValue<K, V>>(entries);
    }

    public clear(): void {
        this._projectionToKeyAndvalue.clear();
    }

    public delete(key: K): boolean {
        const projectedValue = this._projection(key);
        return this._projectionToKeyAndvalue.delete(projectedValue);
    }

    public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
        this._projectionToKeyAndvalue.forEach((keyAndValue) => {
            callbackfn.call(thisArg, keyAndValue.value, keyAndValue.key, this);
        }, thisArg);
    }

    public tryGetting(key: K): V {
        const projectedValue = this._projection(key);
        const keyAndValue = this._projectionToKeyAndvalue.tryGetting(projectedValue);
        return keyAndValue !== undefined ? keyAndValue.value : undefined;
    }

    public get(key: K): V {
        const projectedValue = this._projection(key);
        return this._projectionToKeyAndvalue.get(projectedValue).value;
    }

    public has(key: K): boolean {
        return this.get(key) !== undefined;
    }

    public set(key: K, value: V): this {
        this._projectionToKeyAndvalue.set(this._projection(key), new KeyAndValue(key, value));
        return this;
    }

    public get size(): number {
        return this._projectionToKeyAndvalue.size;
    }

    public * entries(): IterableIterator<[K, V]> {
        for (const keyAndValue of this._projectionToKeyAndvalue.values()) {
            yield [keyAndValue.key, keyAndValue.value];
        }
    }

    public * keys(): IterableIterator<K> {
        for (const keyAndValue of this._projectionToKeyAndvalue.values()) {
            yield keyAndValue.key;
        }
    }

    public * values(): IterableIterator<V> {
        for (const keyAndValue of this._projectionToKeyAndvalue.values()) {
            yield keyAndValue.value;
        }
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.entries();
    }

    public get [Symbol.toStringTag](): 'Map' {
        return JSON.stringify(Array.from(this.entries())) as 'Map';
    }
}
