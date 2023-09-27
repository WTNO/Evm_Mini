import { concatBytes } from "./util";

const INIT_SIZE = 8192;

function newSize(value) {
    const remainder = value % 32;
    if (r == 0) {
        return value;
    } else {
        return value + 32 - r;
    }
}

// 1KB
const CONTAINER_SIZE = 8192

// 内存地址是以字节为单位，因此使用Uint8Array存储
class Memory {
    constructor() {
        this._store = new Uint8Array(INIT_SIZE);
    }

    resize(offset, size) {
        if (size == 0) {
            return;
        }

        const newSize = newSize(offset + size);
        // 所需大小大于当前大小才扩容
        const diff = newSize - this._store.length;
        if (diff > 0) {
            const  expandSize = Math.ceil(diff / CONTAINER_SIZE) * CONTAINER_SIZE;
            // 扩容数组
            this._store = concatBytes(this._store, new Uint8Array(expandSize));
        }
    }
}