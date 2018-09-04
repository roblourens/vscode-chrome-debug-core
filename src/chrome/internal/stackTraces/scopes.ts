import { LocationInScript } from '../locationInResource';
import { Crdp } from '../../..';

export class Scope {
    constructor(
        public readonly type: ('global' | 'local' | 'with' | 'closure' | 'catch' | 'block' | 'script' | 'eval' | 'module'),
        public readonly object: NonNullable<Crdp.Runtime.RemoteObject>,
        public readonly name?: string,
        public readonly startLocation?: LocationInScript,
        public readonly endLocation?: LocationInScript) { }
}
