export class Storage {
    constructor() {
        this._store = new Map();
    }

    put(address, k, v) {
        let map = this._store.get(address);
        if (map === undefined || map === null) {
            map = new Map();
        }
        map.set(k, v);
    }

    get(address, k) {
        let map = this._store.get(address);

        if (map !== undefined || map !== null) {
            return map.get(k);
        }
    }
}