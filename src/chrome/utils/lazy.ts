/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const empty = Symbol();

export class Lazy1<P, T> {
    private _value: T | typeof empty = empty;
    private _parameter: P | typeof empty = empty;
    private _function = (parameter: P) => this.value(parameter);

    public value(parameter: P): T {
        if (this._value === empty) {
            this._value = this._obtainValue(parameter);
            this._parameter = parameter;
        } else if (this._parameter !== parameter) {
            throw new Error(`Can't obtain a lazy value with parameter ${parameter} when the previous call used parameter ${String(this._parameter)}`);
        }

        return this._value;
    }

    public get function(): (parameter: P) => T {
        return this._function;
    }

    constructor(private readonly _obtainValue: (parameter: P) => T) { }
}