import * as assert from 'assert';

export class BidirectionalMap<Left, Right> {
    private _leftToRight = new Map<Left, Right>();
    private _rightToLeft = new Map<Right, Left>();

    public clear(): void {
        this._leftToRight.clear();
        this._rightToLeft.clear();
    }

    public deleteByLeft(left: Left): boolean {
        const right = this._leftToRight.get(left);
        if (right !== undefined) {
            this.delete(left, right);
            return true;
        } else {
            return false;
        }
    }

    public deleteByRight(right: Right): boolean {
        const left = this._rightToLeft.get(right);
        if (left !== undefined) {
            this.delete(left, right);
            return true;
        } else {
            return false;
        }
    }

    private delete(left: Left, right: Right): void {
        assert.ok(this._leftToRight.delete(left), `Expected left (${left}) associated with right (${right}) to exist on the left to right internal map`);
        assert.ok(this._rightToLeft.delete(right), `Expected right (${right}) associated with left (${left}) to exist on the right to left internal map`);
    }

    public forEach(callbackfn: (Right: Right, left: Left, map: Map<Left, Right>) => void, thisArg?: any): void {
        return this._leftToRight.forEach(callbackfn);
    }

    public getByLeft(left: Left): Right | undefined {
        return this._leftToRight.get(left);
    }

    public getByRight(right: Right): Left | undefined {
        return this._rightToLeft.get(right);
    }

    public hasLeft(left: Left): boolean {
        return this._leftToRight.has(left);
    }

    public hasRight(right: Right): boolean {
        return this._rightToLeft.has(right);
    }

    public set(left: Left, right: Right): this {
        const existingRightForLeft = this._leftToRight.get(left);
        const existingLeftForRight = this._rightToLeft.get(right);

        if (existingRightForLeft !== undefined) {
            throw new Error(`Can't set the pair left (${left}) and right (${right}) because there is already a right element (${existingRightForLeft}) associated with the left element`);
        }

        if (existingLeftForRight !== undefined) {
            throw new Error(`Can't set the pair left (${left}) and right (${right}) because there is already a left element (${existingLeftForRight}) associated with the right element`);
        }

        this._leftToRight.set(left, right);
        this._rightToLeft.set(right, left);
        return this;
    }

    public size(): number {
        return this._leftToRight.size;
    }
}