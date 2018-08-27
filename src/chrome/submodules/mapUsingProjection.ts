class KeyAndValue<K, V> {
    constructor(private _key: K, private _value: V) {

    }

    public get key(): K {
        return this._key;
    }

    public get value(): V {
        return this._value;
    }
}

export interface IProjection<K, P> {
    (key: K): P;
}

export class MapUsingProjection<K, V, P> implements Map<K, V> {
    private _projectionToKeyAndvalue = new Map<P, KeyAndValue<K, V>>();

    constructor(private _projection: IProjection<K, P>) {

    }

    public clear(): void {
        this._projectionToKeyAndvalue.clear();

    }
    public delete(key: K): boolean {
        const projectedValue = this._projection(key);
        return this._projectionToKeyAndvalue.delete(projectedValue);
    }

    public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
        this._projectionToKeyAndvalue.forEach((keyAndValue, projection) => {
            callbackfn.call(thisArg, keyAndValue.value, keyAndValue.key, this);
        }, thisArg);
    }

    public get(key: K): V | undefined {
        const projectedValue = this._projection(key);
        const keyAndValue = this._projectionToKeyAndvalue.get(projectedValue);
        return keyAndValue !== undefined ? keyAndValue.value : undefined;
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