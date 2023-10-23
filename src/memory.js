import { concatBytes } from "./bytes.js";

const INIT_SIZE = 8192;

function newSize(value) {
    const r = value % 32;
    if (r == 0) {
        return value;
    } else {
        return value + 32 - r;
    }
}

// 1KB
const CONTAINER_SIZE = 8192

// 内存地址是以字节为单位，因此使用Uint8Array存储
export class Memory {
    constructor() {
        this._store = new Uint8Array(INIT_SIZE);
    }

    // 扩容
    resize(offset, size) {
        if (size == 0) {
            return;
        }

        const nSize = newSize(offset + size);
        // 所需大小大于当前大小才扩容
        const diff = nSize - this._store.length;
        if (diff > 0) {
            const  expandSize = Math.ceil(diff / CONTAINER_SIZE) * CONTAINER_SIZE;
            // 扩容数组
            this._store = concatBytes(this._store, new Uint8Array(expandSize));
        }
    }

    // 将数据写入memory
    set(offset, size, value) {
        if (size === 0) {
            return;
        }

        this.resize(offset, size);

        if (size !== value.length) {
            throw new Error('Invalid value size');
        }

        if (offset + size > this._store.length) {
            throw new Error('Value exceeds memory capacity');
        }

        this._store.set(value, offset)
    }

    // 返回复制的副本，改动数组的内容不会影响到原数组
    getCopy(offset, size) {
        this.resize(offset, size);
        
        const result = new Uint8Array(size);

        result.set(this._store.subarray(offset, offset + size));

        return result;
    }

    // 使用该方法返回的新数组还是建立在原有的 Buffer 之上的，所以，改动数组的内容将会影响到原数组
    getPtr(offset, size) {
        this.resize(offset, size);
        return this._store.subarray(offset, offset + size);
    }
}