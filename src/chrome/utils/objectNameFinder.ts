export type NamespaceTree<T> = { [name: string]: NamespaceTree<T> | T };

export class ObjectNameFinder<T> {
    private readonly _objectToNameMapping = new Map<T, string>();

    constructor(
        private readonly _root: NamespaceTree<T>,
        private readonly _isLeaf: (node: NamespaceTree<T> | T) => node is T,
        private readonly _namesPrefix: string) { }

    public find(): Map<T, string> {
        this.addNames(this._root, this._namesPrefix);
        return this._objectToNameMapping;
    }

    public addNames(currentRoot: NamespaceTree<T>, namePrefix: string): void {
        for (const propertyNamme in Object.getOwnPropertyNames(currentRoot)) {
            const propertyName = `${namePrefix}.${propertyNamme}`;
            const propertyValue = currentRoot[propertyNamme];
            if (this._isLeaf(propertyValue)) {
                this._objectToNameMapping.set(propertyValue as T, propertyName);
            } else {
                this.addNames(propertyValue, propertyName);
            }
        }
    }
}