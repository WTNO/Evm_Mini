class Stack {
    constructor(maxHeight) {
        this._store = [];
        this._len = 0;
        this._maxHeight = maxHeight !== null && maxHeight !== undefined && typeof maxHeight === 'number' ? maxHeight : 1024;
    }

    push(value) {
        if (typeof value !== 'bigint') {
            throw new Error('Invalid value type. Only bigint is allowed.');
        }

        if (this._len > this._maxHeight) {
            throw new Error('stack overflow');
        }

        this._store.push(value);
        this.len++;
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

        const temp = this._store[this._len - 1];
        this._store[this.len - 1] = this._store[this._len - position];
        this._store[this.len - position] = temp;
    }

    dup(position) {

    }

    isEmpty() {
        return this._len === 0;
    }

    size() {
        return this._len;
    }
}