// 堆栈的最大深度为 1024 项
// 堆栈中的每个项目是一个 256 位（32 字节）的字。
export class Stack {
    constructor(maxHeight) {
        this._store = [];
        this._len = 0;
        this._maxHeight = 1024;
    }

    push(value) {
        if (typeof value !== 'bigint') {
            throw new Error('Invalid value type. Only bigint is allowed.');
        }

        if (this._len > this._maxHeight) {
            throw new Error('stack overflow');
        }

        this._store.push(value);
        this._len++;
    }

    pop() {
        if (!this.isEmpty()) {
            this._len--;
            return this._store.pop();
        } else {
            throw new Error('stack underflow');
        }
    }

    peek() {
        if (!this.isEmpty()) {
            return this._store[this._store.length - 1];
        } else {
            throw new Error('stack underflow');
        }
    }

    swap(position) {
        if (this._len <= position) {
            throw new Error('stack underflow');
        }

        position += 1;

        const temp = this._store[this._len - 1];
        this._store[this._len - 1] = this._store[this._len - position];
        this._store[this._len - position] = temp;
    }

    // 复制指定栈中元素并将其副本压入栈顶
    dup(position) {
        const len = this._len;
        if (len < position) {
            throw new Error('stack underflow');
        }

        if (len >= this._maxHeight) {
            throw new Error('stack overflow');
        }

        const i = len - position;
        this._store.push(this._store[i]);
        this._len++;
    }

    isEmpty() {
        return this._len === 0;
    }

    size() {
        return this._len;
    }

    getStack() {
        return this._store.slice(0, this._len)
    }
}