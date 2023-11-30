import { keccak256 } from "ethereum-cryptography/keccak.js";
import { RLP } from "@ethereumjs/rlp";

const BIGINT_0 = BigInt(0)
const BIGINT_1 = BigInt(1)
const BIGINT_2 = BigInt(2)
const BIGINT_3 = BigInt(3)
const BIGINT_7 = BigInt(7)
const BIGINT_8 = BigInt(8)
const BIGINT_31 = BigInt(31)
const BIGINT_32 = BigInt(32)
const BIGINT_255 = BigInt(255)
const BIGINT_256 = BigInt(256)
const TWO_POW256 = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000')
const BIGINT_2EXP256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639936')

// 2**256 - 1
const MAX_INTEGER_BIGINT = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')

function concatBytes(...arrs) {
    if (arrs.length === 1) return arrs[0];

    // 计算传入数组总长度
    const length = arrs.reduce((total, arr) => {
        if (!(arr instanceof Uint8Array)) {
            throw new Error('The arrs parameter must be of type Uint8Array')
        }
        return total + arr.length;
    }, 0);

    const newArr = new Uint8Array(length);

    let offset = 0;
    arrs.forEach(function (arr, index) {
        newArr.set(arr, offset);
        offset += arr.length;
    });

    return newArr;
}

// 16进制字符串 转 Uint8Array
function hexToBytes(hexStr) {
    if (typeof hexStr !== 'string') {
        throw new Error(`hex argument type ${typeof hexStr} must be of type string`);
    }

    if (!hexStr.startsWith("0x")) {
        throw new Error(`prefixed hex input should start with 0x, got ${hexStr.substring(0, 2)}`);
    }

    // 长度为单数，头部补0
    if (hexStr.length % 2) {
        hexStr = "0" + hexStr.substring(2);
    } else {
        hexStr = hexStr.substring(2);
    }

    const result = new Uint8Array(hexStr.length / 2);

    for (let i = 0; i < hexStr.length / 2; i++) {
        // 每两位16进制的字符串转坏为一个byte
        result[i] = parseInt(hexStr.slice(i * 2, (i + 1) * 2), 16);
    }

    return result;
}

const hexByByte = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'))

// Uint8Array 转 16进制字符串
function bytesToHex(bytes) {
    let hex = '0x'
    if (bytes === undefined || bytes === null || bytes.length === 0) return hex
    for (const byte of bytes) {
        hex += hexByByte[byte]
    }
    return hex
}

// Uint8Array 转 BigInt 
// bytes[0]是最大端，bytes[bytes.length - 1]是最小端
function bytesToBigInt(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        throw new Error('Input type is not Uint8Array');
    }
    const hex = bytesToHex(bytes);
    if (hex === '0x') {
        return BIGINT_0;
    }

    return BigInt(hex);
}

// BigInt 转 Uint8Array
function bigintToBytes(data) {
    if (typeof data !== 'bigint') {
        throw new Error('Input type is not BigInt');
    }

    // 转为16进制字符串
    let hex = data.toString(16);

    // 填充到偶数位数
    if (hex.length % 2) {
        hex = '0' + hex;
    }

    return hexToBytes('0x' + hex);
}

// 左边补0
function padZeroOnLeft(data, length) {
    // 输入类型必须为Uint8Array
    if (!(data instanceof Uint8Array)) {
        throw new Error('input type must be Uint8Array');
    }

    if (data.length < length) {
        const zeros = new Uint8Array(length - data.length);
        return new Uint8Array([...zeros, ...data]);
    }
    return data.subarray(-length);
}

// 右边补0
function padZeroOnRight(data, length) {
    // 输入类型必须为Uint8Array
    if (!(data instanceof Uint8Array)) {
        throw new Error('input type must be Uint8Array');
    }

    if (data.length < length) {
        const zeros = new Uint8Array(length - data.length);
        return new Uint8Array([...data, ...zeros]);
    }
    return data.subarray(-length);
}

function mod(a, b) {
    let r = a % b;
    if (r < BIGINT_0) {
        r = b + r;
    }
    return r;
}

function getByteSlice(bytes, offset, size) {
    if (!(bytes instanceof Uint8Array)) {
        throw new Error('Input type is not Uint8Array');
    }

    const len = BigInt(bytes.length);

    let end = offset + size;

    if (end > len) {
        end = len;
    }

    const data = padZeroOnRight(bytes.subarray(Number(offset), Number(end)), Number(size));

    return data;
}

function isJumpdest(context, counter) {
    return context.codebyte[counter] === 0x5b
}

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
class Memory {
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

class Storage {
    constructor() {
        this._store = new Map();
    }

    put(address, k, v) {
        let map = this._store.get(address);
        if (map === undefined || map === null) {
            map = new Map();
            this._store.set(address, map);
        }
        map.set(k, v);
    }

    get(address, k) {
        let map = this._store.get(address);

        if (map !== undefined && map !== null) {
            return map.get(k);
        }
        return undefined;
    }
}

// 堆栈的最大深度为 1024 项
// 堆栈中的每个项目是一个 256 位（32 字节）的字。
class Stack {
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

// 指令集

const opCodeFunctionMap = new Map([
    // STOP
    [
        0x00,
        function () {
            throw new Error('STOP');
        }
    ],
    // ADD
    [
        0x01,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a + b, TWO_POW256));
        }
    ],
    // MUL
    [
        0x02,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a * b, TWO_POW256));
        }
    ],
    // SUB
    [
        0x03,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a - b, TWO_POW256));
        }
    ],
    // DIV 整数除法运算
    [
        0x04,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            if (b === BIGINT_0) {
                context.stack.push(BIGINT_0);
            } else {
                context.stack.push(mod(a / b, TWO_POW256));
            }
        }
    ],
    // SDIV 将a和b解释为二进制补码有符号整数，对两个操作数进行有符号除法，并将结果设置为r。如果b == 0，那么r被设置为0。
    [
        0x05,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            if (b === BIGINT_0) {
                context.stack.push(BIGINT_0);
            } else {
                // 将 BigInt 值转换为一个 -2^(width-1) 与 2^(width-1)-1 之间的有符号整数
                a = BigInt.asIntN(256, a);
                b = BigInt.asIntN(256, b);

                // 将 BigInt 转换为一个 0 和 2^width-1 之间的无符号整数。
                context.stack.push(BigInt.asUintN(256, a / b));
            }
        }
    ],
    // MOD
    [
        0x06,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            if (b === BIGINT_0) {
                context.stack.push(BIGINT_0);
            } else {
                context.stack.push(mod(a, b));
            }
        }
    ],
    // SMOD SMod将a和b解释为二进制补码有符号整数，将结果设置为（a的符号）* { abs(a) mod abs(b) }。
    // 如果b == 0，那么结果被设置为0（注意：这与big.Int有所不同）。
    [
        0x07,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            if (b === BIGINT_0) {
                context.stack.push(BIGINT_0);
            } else {
                context.stack.push(BigInt.asIntN(256, -100n) % BigInt.asIntN(256, 3n));
            }
        }
    ],
    // ADDMOD (a + b) % N：加法后跟模运算的整数结果。如果分母是0，结果将为0。
    [
        0x08,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            const n = context.stack.pop();
            if (n === BIGINT_0) {
                context.stack.push(BIGINT_0);
            } else {
                context.stack.push(mod(a + b, n));
            }
        }
    ],
    // MULMOD (a * b) % N：乘法后跟模运算的整数结果。如果分母是0，结果将为0。
    [
        0x09,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            const n = context.stack.pop();
            if (n === BIGINT_0) {
                context.stack.push(BIGINT_0);
            } else {
                context.stack.push(mod(a * b, n));
            }
        }
    ],
    // EXP z = base**exponent mod 2**256, and returns z.
    [
        0x0a,
        function (context) {
            const base = context.stack.pop();
            const exponent = context.stack.pop();
            if (exponent === BIGINT_0) {
                context.stack.push(BIGINT_1);
                return;
            }

            if (base === BIGINT_0) {
                context.stack.push(base);
                return;
            }

            const result = (base ** exponent) % BIGINT_2EXP256;
            context.stack.push(result);
        }
    ],
    // SIGNEXTEND扩展了二进制补码有符号整数的长度，如果byteNum>31，则将z设置为x；
    // 如果x被解释为在(byteNum*8+7)处有符号位的有符号数，扩展到完整的256位，则将z设置为x，并返回z。
    // (没看太懂)
    [
        0x0b,
        function (context) {
            const b = context.stack.pop();
            const x = context.stack.pop();

            if (b < BIGINT_31) {
                const signBit = b * BIGINT_8 + BIGINT_7
                const mask = (BIGINT_1 << signBit) - BIGINT_1
                if ((x >> signBit) & BIGINT_1) {
                    x = x | BigInt.asUintN(256, ~mask)
                } else {
                    x = x & mask
                }
            }
            context.stack.push(x)
        }
    ],
    // LT
    [
        0x10,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(a < b ? BIGINT_1 : BIGINT_0);
        }
    ],
    // GT
    [
        0x11,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(a > b ? BIGINT_1 : BIGINT_0);
        }
    ],
    // SLT 所有值都被视为二进制补码有符号的256位整数。
    [
        0x12,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(BigInt.asIntN(256, a) < BigInt.asIntN(256, b) ? BIGINT_1 : BIGINT_0);
        }
    ],
    // SGT 所有值都被视为二进制补码有符号的256位整数。
    [
        0x13,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(BigInt.asIntN(256, a) > BigInt.asIntN(256, b) ? BIGINT_1 : BIGINT_0);
        }
    ],
    // EQ
    [
        0x14,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(a === b ? BIGINT_1 : BIGINT_0);
        }
    ],
    // ISZERO
    [
        0x15,
        function (context) {
            const a = context.stack.pop();
            context.stack.push(a === BIGINT_0 ? BIGINT_1 : BIGINT_0);
        }
    ],
    // AND
    [
        0x16,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(a & b);
        }
    ],
    // OR
    [
        0x17,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(a | b);
        }
    ],
    // XOR
    [
        0x18,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(a ^ b);
        }
    ],
    // NOT
    [
        0x19,
        function (context) {
            const a = context.stack.pop();
            context.stack.push(BigInt.asUintN(256, ~a));
        }
    ],
    // BYTE
    // 将位置n的字节值设定为z，将'z'视为大端序的32字节整数。
    // 如果'n' > 32，f设定为0。
    // 示例：f = '5'，n=31 => 5。(没看懂)
    [
        0x1a,
        function (context) {
            const i = context.stack.pop();
            const x = context.stack.pop();

            if (i > BIGINT_32) {
                context.stack.push(BIGINT_0);
                return
            }

            const r = (x >> ((BIGINT_31 - i) * BIGINT_8)) & BIGINT_255;
            context.stack.push(r);
        }
    ],
    // SHL 逻辑左移
    // 将比特位向最高有效位移动。移动后的256位之后的比特位将被丢弃，新的比特位将设为0。
    // shift：向左移动的位数。
    // value：需要移动的32字节。
    // value << shift：移位后的值。如果shift大于255，返回0。(TODO:这里怎么感觉应该是大于255？)
    [
        0x1b,
        function (context) {
            const shift = context.stack.pop();
            const value = context.stack.pop();

            if (shift > BIGINT_255) {
                context.stack.push(BIGINT_0);
                return;
            }

            const r = (value << shift) & MAX_INTEGER_BIGINT;
            context.stack.push(r);
        }
    ],
    // SHR 逻辑右移
    // 将比特位向最低有效位移动。移动前的第一位之前的比特位将被丢弃，新的比特位将设为0。
    // shift：向右移动的位数。
    // value：需要移动的32字节。
    // value >> shift：移位后的值。如果shift大于255，返回0。
    [
        0x1c,
        function (context) {
            const shift = context.stack.pop();
            const value = context.stack.pop();

            if (shift > BIGINT_255) {
                context.stack.push(BIGINT_0);
                return;
            }

            const r = value >> shift
            context.stack.push(r);
        }
    ],
    // SAR 算数右移（带符号右移）
    // 将比特位向最低有效位移动。在第一个之前移动的比特位将被丢弃，如果之前的最高有效位是0，则新的比特位设为0，否则新的比特位设为1。
    // shift：向右移动的位数。
    // value：需要移动的整数。
    // value >> shift：移位后的值。
    [
        0x1d,
        function (context) {
            const shift = context.stack.pop();
            const value = context.stack.pop();

            // 转化为带符号树
            const signedValue = BigInt.asIntN(256, value);
            // 判定正负
            const isSigned = signedValue < 0;

            let r;
            if (shift > 256) {
                if (isSigned) {
                    // 负数首尾为0，右移后补1，所以右移位数大于256时，结果为最大值
                    r = MAX_INTEGER_BIGINT;
                } else {
                    // 正数首尾为0，右移后补0，所以右移位数大于256时，结果为0
                    r = BIGINT_0;
                }
                context.stack.push(r);
            }

            // 右移位数小于等于256时
            // 默认补0
            const tempValue = value >> shift;

            // 但是负数要将最高有效位开始的shift位补1
            if (isSigned) {
                // 255是去掉了符号位？
                const a = BIGINT_255 - shift;
                // 最大值先右移a位再左移a位，结果就是从最高有效位开始shift位都是1
                const b = (MAX_INTEGER_BIGINT >> a) << a;
                // 补1
                r = b | tempValue;
            } else {
                r = tempValue;
            }

            context.stack.push(r);
        }
    ],
    // SHA3 计算给定内存中数据的Keccak-256哈希值
    [
        0x20,
        function (context) {
            const offset = context.stack.pop();
            const size = context.stack.pop();

            let data = new Uint8Array(); 
            if (size !== BIGINT_0) {
                data = context.memory.getPtr(Number(offset), Number(size));
            }
            const r = BigInt(bytesToHex(keccak256(data)));
            context.stack.push(r);
        }
    ],
    // 0x30 - 0x4a 部分涉及解释器interpreter和区块部分内容
    // ADDRESS 获取当前执行账户的地址
    [
        0x30,
        function (context) {
            const address = bytesToBigInt(context.interpreter.getAddress());
            context.stack.push(address);
        }
    ],
    // BALANCE 获取给定账户的余额
    [
        0x31,
        async function (context) {
            // 从stack获取地址
            const addressBigInt = context.stack.pop();
            
            const balance = await context.interpreter.getBalance(addressBigInt);
            context.stack.push(balance);
        }
    ],
    // ORIGIN 获取执行起始地址
    [
        0x32,
        function (context) {
            context.stack.push(context.interpreter.getTxOrigin())
        }
    ],
    // CALLER 获取呼叫者地址
    [
        0x33,
        function (context) {
            context.stack.push(context.interpreter.getCaller());
        }
    ],
    // CALLVALUE 获取负责此执行的指令/交易存入的价值
    [
        0x34,
        function (context) {
            context.stack.push(context.interpreter.getCallValue());
        }
    ],
    // CALLDATALOAD 获取当前环境的输入数据
    // 堆栈输入
    // i: calldata中的字节偏移量。
    // 堆栈输出
    // data[i]: 从calldata给定偏移量开始的32字节值。在calldata结束后的所有字节都设置为0。
    [
        0x35,
        function (context) {
            const i = context.stack.pop();
            if (i > context.interpreter.getCallDataSize()) {
                context.stack.push(BIGINT_0);
                return;
            }

            const loadData = context.interpreter.getCallData().subarray(Number(i), Number(i) + 32)

            const l = bytesToBigInt(padZeroOnRight(loadData, 32));

            context.stack.push(l);
        }
    ],
    // CALLDATASIZE 获取当前环境中输入数据的大小
    [
        0x36,
        function (context) {
            const r = context.interpreter.getCallDataSize()
            context.stack.push(BigInt(r))
        }
    ],
    // CALLDATACOPY 将当前环境中的输入数据复制到内存中。
    // 堆栈输入
    // destOffset：结果将复制到内存中的字节偏移量。
    // offset：需要复制的调用数据的字节偏移量。
    // size：需要复制的字节大小。
    [
        0x37,
        function (context) {
            const destOffset = context.stack.pop();
            const offset = context.stack.pop();
            const size = context.stack.pop();
            
            callDataCopy = getByteSlice(context.callData, offset, size);
            context.memory.set(Number(destOffset), Number(size), code);
        }
    ],
    // CODESIZE
    [
        0x38,
        function (context) {
            context.stack.push(context.interpreter.getCodeSize())
        }
    ],
    // CODECOPY 将当前环境中运行的代码复制到内存
    // 堆栈输入
    // destOffset：将复制结果在内存中的字节偏移量。
    // offset：要复制的代码中的字节偏移量。
    // size：要复制的字节大小。
    [
        0x39,
        function (context) {
            const destOffset = context.stack.pop()
            const offset = context.stack.pop()
            const size = context.stack.pop()

            // 截取code，长度不足的在后面补0
            const code = getByteSlice(context.interpreter.getCode(), offset, size)

            // 将code写入内存
            context.memory.set(Number(destOffset), Number(size), code);
        }
    ],
    // GASPRICE 获取当前环境中的gas价格
    [
        0x3a,
        function (context) {
            context.stack.push(context.interpreter.getTxGasPrice())
        }
    ],
    // EXTCODESIZE 获取账户代码的大小
    // 堆栈输入
    // address：要查询的合约的20字节地址。
    // 堆栈输出
    // size：代码的字节大小。
    [
        0x3b,
        function (context) {
            const addressBigInt = context.stack.pop();
            const address = bytesToHex(bigintToBytes(addressBigInt));
            // TODO
            const size = BigInt(context.evm.getCode(address).length);
            context.stack.push(size);
        }
    ],
    // EXTCODECOPY 将帐户的代码复制到内存中。
    // 堆栈输入
    // address：要查询的合约的20字节地址。
    // destOffset：结果将被复制到的内存中的字节偏移量。
    // offset：要复制的代码的字节偏移量。
    // size：要复制的字节大小。
    [
        0x3c,
        function (context) {
            const addressBigInt = context.stack.pop();
            const destOffset = context.stack.pop();
            const offset = context.stack.pop();
            const size = context.stack.pop();

            const address = bytesToHex(bigintToBytes(addressBigInt));
            const code = getByteSlice(context.evm.getCode(address), offset, size);

            context.memory.set(Number(destOffset), Number(size), code);
        }
    ],
    // RETURNDATASIZE 获取当前环境中上一次call的输出数据大小
    // 可以使用CALL, CALLCODE, DELEGATECALL 或 STATICCALL 创建子上下文。
    // 返回最后执行的子上下文的返回数据的字节大小。
    [
        0x3d,
        function (context) {
            context.stack.push(BigInt(context.interpreter.getReturnDataSize()))
        }
    ],
    // RETURNDATACOPY 将上一次调用的输出数据复制到内存中。
    // 堆栈输入
    // destOffset: 结果将被复制到内存中的字节偏移量。
    // offset: 需要复制的上一次执行的子上下文中的返回数据的字节偏移量。
    // size: 需要复制的字节大小。
    [
        0x3e,
        function (context) {
            const destOffset = context.stack.pop();
            const offset = context.stack.pop();
            const size = context.stack.pop();

            const returnData = getByteSlice(context.interpreter.getCallData(), offset, size);
            context.memory.set(Number(destOffset), Number(size), returnData);
        }
    ],
    // EXTCODEHASH 获取账户代码的哈希值
    // 堆栈输入
    // address: 账户的20字节地址。
    // 堆栈输出
    // hash: 选定账户代码的哈希值，如果账户没有代码，则为空哈希（0xc5d24601...），如果账户不存在或已被销毁，则为0。
    [
        0x3f,
        function (context) {
            const addressBigInt = context.stack.pop();
            const address = bytesToHex(bigintToBytes(addressBigInt));

            const code = context.evm.getCode(address);
            if ( code === null || code === undefined) {
                context.stack.push(BIGINT_0);
                return;
            }
            
            context.stack.push(bytesToBigInt(keccak256(code)));
        }
    ],
    // BLOCKHASH 获取最近完成的256个区块之一的哈希值
    // 堆栈输入
    // blockNumber: 用于获取哈希值的区块号。有效范围是最后256个区块（不包括当前的区块）。可以通过NUMBER查询当前的区块号。
    // 堆栈输出
    // hash: 所选区块的哈希值，如果区块号不在有效范围内，哈希值为0。
    [
        0x40,
        function (context) {
            const blockNumber = context.stack.pop();

            const diff = context.interpreter.getBlockNumber - blockNumber;

            if (diff > BIGINT_256 || diff <= BIGINT_0) {
                context.stack.push(BIGINT_0);
                return;
            }

            // TODO:应该用不到吧？
        }
    ],
    // COINBASE 获取区块的受益人地址
    // 矿工的地址。
    [
        0x41,
        function (context) {
            context.stack.push(context.interpreter.getBlockCoinbase())
        }
    ],
    // TIMESTAMP 获取区块的时间戳
    [
        0x42,
        function (context) {
            context.stack.push(context.interpreter.getBlockTimestamp())
        }
    ],
    // NUMBER 获取当前区块的编号
    [
        0x43,
        function (context) {
            context.stack.push(context.interpreter.getBlockNumber());
        }
    ],
    // DIFFICULTY/PREVRANDAO 跳过
    [
        0x44,
        function (context) {

        }
    ],
    // GASLIMIT
    [
        0x45,
        function (context) {
            context.stack.push(context.interpreter.getBlockGasLimit())
        }
    ],
    // CHAINID
    [
        0x46,
        function (context) {
            context.stack.push(context.interpreter.getChainId())
        }
    ],
    // SELFBALANCE
    [
        0x47,
        function (context) {
            context.stack.push(context.interpreter.getSelfBalance())
        }
    ],
    // BASEFEE 获取基础费用
    [
        0x48,
        function (context) {
            context.stack.push(context.interpreter.getBlockBaseFee())
        }
    ],
    // BLOBHASH
    // [
    //     0x49,
    //     function (context) {

    //     }
    // ],
    // BLOBBASEFEE
    // [
    //     0x4a,
    //     function (context) {
    //         context.stack.push(context.interpreter.getBlobBaseFee())
    //     }
    // ],
    // POP 从堆栈中移除项目
    [
        0x50,
        function (context) {
            context.stack.pop();
        }
    ],
    // MLOAD 从内存中加载word
    // 堆栈输入
    // offset：内存中的字节偏移量。
    // 堆栈输出
    // value：从该偏移量开始的内存中的32个字节。如果超出其当前大小（参见MSIZE），则写入0。
    [
        0x51,
        function (context) {
            const offset = context.stack.pop();

            const word = context.memory.getPtr(Number(offset), 32);

            context.stack.push(bytesToBigInt(word))
        }
    ],
    // MSTORE 将word保存到内存
    // 堆栈输入
    // offset：内存中的字节偏移量。
    // value：要写入内存的32字节值。
    [
        0x52,
        function (context) {
            const offset = context.stack.pop();
            const value = context.stack.pop();

            // bigint 转 Uint8Array
            const data = padZeroOnLeft(bigintToBytes(value), 32);

            context.memory.set(Number(offset), 32, data)
        }
    ],
    // MSTORE8 将byte保存到内存
    // 堆栈输入
    // offset：内存中的偏移量，以字节为单位。
    // value：写入内存的1字节值（只写入32字节堆栈值的最低有效字节）。
    [
        0x53,
        function (context) {
            const offset = context.stack.pop();
            const value = context.stack.pop();

            // bigint 转 Uint8Array
            // BIGINT_255 也就是 0x00..00ffffffff
            const data = bigintToBytes(value) & BIGINT_255;

            context.memory.set(Number(offset), 1, data)
        }
    ],
    // SLOAD 从存储中加载word
    // 堆栈输入
    // key：存储中的32字节密钥。
    // 堆栈输出
    // value：与该键对应的32字节值。如果之前从未写过该键，则为0。
    [
        0x54,
        function (context) {
            const key = context.stack.pop();

            const r = context.storage.get(context.to, key);

            context.stack.push(r === undefined ? BIGINT_0 : r);
        }
    ],
    // SSTORE 将word保存到存储器
    // 堆栈输入
    // key：存储中的32字节密钥。
    // value：要存储的 32 字节值。
    [
        0x55,
        function (context) {
            if (context.isStatic) {
                throw new Error("static state change");
            }
            const key = context.stack.pop();
            const value = context.stack.pop();

            context.storage.put(context.to, key, value);
        }
    ],
    // JUMP 更改程序计数器，从而中断执行到已部署代码中另一个点的线性路径。它用于实现类似函数的功能。
    // 堆栈输入
    // counter：已部署代码中的字节偏移量，将从此处继续执行。必须是JUMPDEST指令。
    [
        0x56,
        function (context) {
            const counter = context.stack.pop();

            // 程序计数器不能超过代码大小
            if (counter > context.interpreter.getCodeSize()) {
                throw new Error('invalid JUMP');
            }

            if (!isJumpdest(context, counter)) {
                throw new Error('JUMP ERROR')
            }

            context.programCounter = Number(counter);
        }
    ],
    // JUMPI
    // 堆栈输入
    // counter：已部署代码中的字节偏移量，将从此处继续执行。必须是JUMPDEST指令。
    // b：只有当该值不为 0 时，程序计数器才会被更改为新值。否则，程序计数器将简单地递增并执行下一条指令。
    [
        0x57,
        function (context) {
            const counter = context.stack.pop();
            const b = context.stack.pop();

            if (b !== BIGINT_0) {
                // 程序计数器不能超过代码大小
                if (counter > context.interpreter.getCodeSize()) {
                    throw new Error('invalid JUMP');
                }

                if (!isJumpdest(context, Number(counter))) {
                    throw new Error('JUMP ERROR')
                }

                context.programCounter = Number(counter);
            }
        }
    ],
    // PC
    // 程序计数器（PC）是已部署代码中的字节偏移量。它指示将执行哪个指令。
    // 例如，当执行ADD时，PC会增加1，因为指令是1字节。PUSH指令大于一个字节，因此会相应地增加计数器。
    // 
    // 堆栈输出:counter，当前程序中此指令的PC。
    [
        0x58,
        function (context) {
            context.stack.push(BigInt(context.programCounter - 1))
        }
    ],
    // MSIZE 获取活动内存的大小（以字节为单位）
    // 内存始终是完全可访问的。这条指令跟踪的是当前执行中访问的最高偏移量。对更大偏移量的首次写入或读取将触发内存扩展，这将消耗燃料。大小始终是字（32字节）的倍数。
    // 堆栈输出
    // size：当前内存大小（迄今为止访问的最高偏移量+1）以字节为单位。
    [
        0x59,
        function (context) {
            // TODO:没看懂怎么计算
        }
    ],
    // GAS 获取可用的燃料数量，包括此指令的成本相应的减少量。
    // 堆栈输出
    // gas：剩余燃料（在执行此指令后）。
    [
        0x5a,
        function (context) {
            // TODO
            context.stack.push(2516n);
        }
    ],
    // JUMPDEST 标记一个有效的跳转目标
    // 标记一个对于 JUMP 或 JUMPI 的有效跳转目标。此操作在执行过程中对机器状态没有影响。
    [
        0x5b,
        function () { }
    ],
    // PUSH0 将值0放在堆栈上
    // 新的值被放在堆栈的顶部，增加所有其他值的索引。
    // 因此，特定操作码的值必须按堆栈的反序推入。例如，使用MSTORE，首先推入的值必须是value，然后是offset。
    [
        0x5f,
        function (context) {
            context.stack.push(BIGINT_0);
        }
    ],
    // PUSH1 至 PUSH32
    // 0x60 - 0x7f
    // 将N字节项放在堆栈上
    // 堆栈输出
    // value：推入的值，向右对齐（放在最低有效字节中）。
    [
        0x60,
        function (context) {
            // 计算需要push的字节数
            const size = context.opCode - 0x5f;

            // 程序计数器 + 字节数 必须小于等于 代码字节数
            if (context.programCounter + size > context.codebyte.length) {
                throw new Error('out of range');
            }

            const bytes = context.codebyte.subarray(context.programCounter, context.programCounter + size);
            context.stack.push(bytesToBigInt(bytes));
            context.programCounter += size;
        }
    ],
    // DUP1 - DUP16 复制第N个堆栈项
    // 0x80 - 0x8f
    [
        0x80,
        function (context) {
            const position = context.opCode - 0x7f;
            context.stack.dup(position);
        }
    ],
    // SWAP1 - SWAP16
    // 0x90 - 0x9f
    // 交换第一个和第 N+1 个堆栈项
    [
        0x90,
        function (context) {
            const position = context.opCode - 0x8f;
            context.stack.swap(position);
        }
    ],
    // LOG0 - LOG4
    // 添加带有 0/1/2/3/4 个主题的日志记录
    // 此指令对EVM状态没有影响。见此处。
    // 堆栈输入：
    // offset：内存中的字节偏移量，以字节为单位。
    // size：要复制的字节大小。
    // 主题1：32字节的值。
    // ...
    // 主题4：32字节的值。
    // TODO：待写interpreter中方法
    [
        0xa0,
        function (context) {
            if (context.isStatic) {
                throw new Error("static state change");
            }
            const offset = context.stack.pop();
            const size = context.stack.pop();

            // topic数量
            const topicNum = context.opCode - 0xa0;

            // 获取topic
            // TODO：前面补0
            const topics = new Array();
            for (let i = 0; i < topicNum; i++) {
                topics[i] = context.stack.pop();
            }

            const topicBytes = topics.map(x => {
                return padZeroOnLeft(bigintToBytes(x), 32);
            })

            let mem = new Uint8Array(0);
            if (size !== BIGINT_0) {
                mem = context.memory.read(Number(offset), Number(size));
            }

            // TODO
            context.interpreter.log(mem, topicNum, topicBytes);
        }
    ],
    // CREATE 创建一个与相关代码关联的新账户。
    // 使用内存中指定偏移处提供的初始化代码创建新的合约。进入计算的目标地址的新子上下文，并执行初始化代码，然后恢复当前上下文。
    // 如果部署成功，新账户的代码将设置为执行初始化代码后返回的数据。
    // 目标地址计算为Keccak-256哈希的最右边20字节（160位），该哈希是发送者地址后跟其随机数的rlp编码。即：
    // address = keccak256(rlp([发送者地址，发送者随机数]))[12:]
    // 堆栈输入
    // value：发送到新账户的以wei为单位的值。
    // offset：内存中的字节偏移量，新账户的初始化代码。
    // size：要复制的字节大小（初始化代码的大小）。
    // 堆栈输出
    // address：部署的合约的地址，如果部署失败则为0。
    [
        0xf0,
        function (context) {
            if (context.isStatic) {
                throw new Error("static state change");
            }

            const value = context.stack.pop();
            const offset = context.stack.pop();
            const size = context.stack.pop();

            let data = new Uint8Array(0);

            if (size != BIGINT_0) {
                data = context.memory.getCopy(Number(offset), Number(size));
            }

            const address = context.interpreter.create(value, data);

            context.stack.push(address);
        }
    ],
    // CALL 
    // 创建一个新的子上下文并执行给定账户的代码，然后恢复当前的上下文。请注意，没有代码的账户将返回成功为真。
    // 如果返回数据的大小未知，也可以在调用后使用RETURNDATASIZE和RETURNDATACOPY指令来检索（自Byzantium分叉以来）。
    // 从Tangerine Whistle分叉开始，除了剩余的一部分（剩余气体/64）外，所有的气体都被限制。如果一个调用试图发送更多，气体就会改变以匹配允许的最大值。
    // 如果呼叫者的余额不足以发送价值，调用就会失败，但当前的上下文不会被撤销。
    // 
    // 堆栈输入
    // gas：发送到子上下文以执行的气体量。未被子上下文使用的气体将返回到这个上下文。
    // address：要执行的账户的上下文。
    // value：发送到账户的wei的价值。
    // argsOffset：内存中的字节偏移量，子上下文的calldata。
    // argsSize：要复制的字节大小（calldata的大小）。
    // retOffset：内存中的字节偏移量，存储子上下文的返回数据。
    // retSize：要复制的字节大小（返回数据的大小）。
    // 
    // 堆栈输出
    // success：如果子上下文反转，则返回0，否则返回1。
    [
        0xf1,
        function (context) {
            const gas = context.stack.pop();
            const addressBigInt = context.stack.pop();
            const value = context.stack.pop();
            const argsOffset = context.stack.pop();
            const argsSize = context.stack.pop();
            const retOffset = context.stack.pop();
            const retSize = context.stack.pop();

            if (context.isStatic && value !== BIGINT_0) {
                throw new Error("static state change");
            }

            const address = bytesToHex(bigintToBytes(addressBigInt));

            // 获取calldata
            let calldata = new Uint8Array(0);
            if (argsSize != BIGINT_0) {
                calldata = context.memory.getCopy(Number(argsOffset), Number(argsSize));
            }
            
            // TODO
            const success = context.interpreter.call(value, calldata, address);

            // writeReturnData(context,retOffset, retSize);

            context.stack.push(success);
        }
    ],
    // CALLCODE 用另一个账户的代码登录此账户。
    // 创建一个新的子上下文，就好像调用自身，但是使用给定账户的代码。特别的，存储保持不变。注意，一个没有代码的账户会返回成功为真。
    // 如果返回数据的大小未知，也可以在调用后通过指令 RETURNDATASIZE 和 RETURNDATACOPY 获取（自Byzantium分叉以来）。
    // 从Tangerine Whistle分叉开始，所有剩余的气体都被限制在当前上下文剩余气体的1/64（remaining_gas / 64）之内。如果一个调用试图发送更多，气体将被更改为允许的最大值。
    // 如果调用者没有足够的余额发送价值，调用失败但当前上下文不会被撤销。
    // 堆栈输入
    // gas：发送到子上下文执行的气体数量。子上下文未使用的气体将返回到这个上下文。
    // address：要执行的账户代码。
    // value：以wei为单位发送到账户的价值。
    // argsOffset：内存中的字节偏移，子上下文的调用数据。
    // argsSize：要复制的字节大小（调用数据的大小）。
    // retOffset：内存中的字节偏移，存储子上下文的返回数据。
    // retSize：要复制的字节大小（返回数据的大小）。
    // 堆栈输出
    // success：如果子上下文撤销，返回0，否则返回1。
    // "callcode" 已经被弃用，现在推荐使用 "delegatecall"。
    [
        0xf2,
        function (context) {
            const gas = context.stack.pop();
            const addressBigInt = context.stack.pop();
            const value = context.stack.pop();
            const argsOffset = context.stack.pop();
            const argsSize = context.stack.pop();
            const retOffset = context.stack.pop();
            const retSize = context.stack.pop();
        }
    ],
    // RETURN 停止执行并返回输出数据
    // offset：在内存中的字节偏移量，用于复制将作为此上下文的返回数据的内容。
    // size：要复制的字节大小（返回数据的大小）。
    [
        0xf3,
        function (context) {
            const offset = context.stack.pop();
            const size = context.stack.pop();

            // 从内存获取返回数据
            const data = context.memory.getPtr(Number(offset), Number(size));
            context.returnData = data;
            throw new Error('RETURNED');
        }
    ],
    // DELEGATECALL 以另一个账户的代码对此账户进行消息调用，但是保持当前的发送者和值的值不变。
    // 创建一个新的子上下文，就像调用自身一样，但是用的是给定账户的代码。特别是存储、当前的发送者和当前的值都保持不变。注意，没有代码的账户将返回成功为真。
    // 如果返回数据的大小未知，也可以在调用后通过RETURNDATASIZE和RETURNDATACOPY指令获取（自Byzantium分叉以来）。
    // 从Tangerine Whistle分叉开始，所有剩余的气体都被限制在剩余气体的64分之一（remaining_gas / 64）。如果一个调用尝试发送更多，气体将被改变以匹配允许的最大量。
    // 堆栈输入
    // gas：发送到子上下文以执行的气体量。未被子上下文使用的气体将返回到这一个。
    // address：要执行的账户的代码。
    // argsOffset：内存中的字节偏移量，子上下文的调用数据。
    // argsSize：要复制的字节大小（调用数据的大小）。
    // retOffset：内存中的字节偏移量，存储子上下文的返回数据。
    // retSize：要复制的字节大小（返回数据的大小）。
    // 堆栈输出
    // success：如果子上下文还原，则返回0，否则返回1。
    [
        0xf4,
        function (context) {
            const gas = context.stack.pop();
            const addressBigInt = context.stack.pop();
            const argsOffset = context.stack.pop();
            const argsSize = context.stack.pop();
            const retOffset = context.stack.pop();
            const retSize = context.stack.pop();

            const address = bytesToHex(bigintToBytes(addressBigInt));

            const value = context.interpreter.getCallValue();

            // 获取calldata
            let calldata = new Uint8Array(0);
            if (argsSize != BIGINT_0) {
                calldata = context.memory.getCopy(Number(argsOffset), Number(argsSize));
            }
            
            // TODO
            const success = context.interpreter.delegateCall(value, calldata, address);

            writeReturnData(context,retOffset, retSize);

            context.stack.push(success);
        }
    ],
    // CREATE2 创建一个与关联代码绑定的、地址可预测的新账户。
    // 相当于CREATE指令，但是盐（salt）的使用允许新合约以一致、确定的地址被部署。
    // 如果部署成功，账户的代码将被设置为执行初始化代码后的返回数据。
    // 目标地址按以下方式计算：
    // initialisation_code = memory[offset:offset+size]
    // address = keccak256(0xff + sender_address + salt + keccak256(initialisation_code))[12:]
    // 部署可能因以下原因失败：
    // 目标地址上已存在合约。
    // 转移的价值不足。
    // 子上下文回滚。
    // 执行初始化代码的燃气费不足。
    // 调用深度限制达到。
    // 请注意，这些失败只影响返回值，并不会导致调用上下文回滚（不像下面的错误情况）。
    // 堆栈输入
    // value：发送到新账户的价值，以wei为单位。
    // offset：新账户初始化代码的内存中的字节偏移量。
    // size：复制的字节大小（初始化代码的大小）。
    // salt：用于以确定性地址创建新账户的32字节值。
    // 堆栈输出
    // address：已部署合约的地址，如果部署失败则为0。
    [
        0xf5,
        function (context) {
            if (context.isStatic) {
                throw new Error("static state change");
            }

            const value = context.stack.pop();
            const offset = context.stack.pop();
            const size = context.stack.pop();
            const salt = context.stack.pop();

            let data = new Uint8Array(0);

            if (size != BIGINT_0) {
                data = context.memory.getCopy(Number(offset), Number(size));
            }

            const address = context.interpreter.create2(value, data, padZeroOnLeft(bigintToBytes(salt), 32));

            context.stack.push(address);

        }
    ],
    // STATICCALL
    // 创建一个新的子上下文并执行给定帐户的代码，然后恢复当前的上下文。注意，没有代码的帐户将返回成功为真（1）。
    // 这条指令等同于CALL，但它不允许在子上下文中修改任何状态的指令或发送ETH。被禁止的指令有CREATE、CREATE2、LOG0、LOG1、LOG2、LOG3、LOG4、SSTORE、SELFDESTRUCT和CALL（如果发送的值不是0）。
    // 如果返回数据的大小未知，也可以在调用后用RETURNDATASIZE和RETURNDATACOPY指令获取（自Byzantium fork以来）。
    // 从Tangerine Whistle fork开始，所有剩余的gas都被限制在当前上下文剩余gas的所有但一个64分之一（remaining_gas / 64）。如果一个调用试图发送更多，gas将被改变以匹配最大允许的值。
    // 堆栈输入
    // gas：发送到子上下文执行的gas数量。子上下文未使用的gas将返回到这个上下文。
    // address：要执行的帐户的上下文。
    // argsOffset：内存中的字节偏移量，子上下文的calldata。
    // argsSize：要复制的字节大小（calldata的大小）。
    // retOffset：内存中的字节偏移量，存储子上下文的返回数据的位置。
    // retSize：要复制的字节大小（返回数据的大小）。
    // 堆栈输出
    // success：如果子上下文reverted，返回0，否则返回1。
    [
        0xfa,
        function (context) {
            const gas = context.stack.pop();
            const addressBigInt = context.stack.pop();
            const argsOffset = context.stack.pop();
            const argsSize = context.stack.pop();
            const retOffset = context.stack.pop();
            const retSize = context.stack.pop();

            const address = bytesToHex(bigintToBytes(addressBigInt));

            const value = BIGINT_0;

            // 获取calldata
            let calldata = new Uint8Array(0);
            if (argsSize != BIGINT_0) {
                calldata = context.memory.getCopy(Number(argsOffset), Number(argsSize));
            }
            
            // TODO
            const success = context.interpreter.staticCall(value, calldata, address);
            
            writeReturnData(context,retOffset, retSize);

            context.stack.push(success);
        }
    ],
    // REVERT 停止执行，恢复状态更改，但返回数据和剩余的燃气。
    // 注释:
    // 停止当前上下文执行，恢复状态更改（参见STATICCALL以获取状态更改操作码列表）并将未使用的燃气返回给调用者。 
    // 它也将燃气退款恢复到当前上下文之前的值。 如果使用REVERT停止执行，值0将被放在调用上下文的堆栈上，该上下文将继续正常执行。 调用上下文的返回数据被设置为此上下文的内存块。
    // 堆栈输入:
    // offset：内存中的字节偏移量（以字节为单位）。 调用上下文的返回数据。
    // size：要复制的字节大小（返回数据的大小）。
    [
        0xfd,
        function (context) {
            const offset = context.stack.pop();
            const size = context.stack.pop();

            context.returnData = context.memory.getPtr(Number(offset), Number(size));

            throw new Error('REVERT');
        }
    ],
    // SELFDESTRUCT 暂停执行并注册账户以便稍后删除。
    // 当前账户被注册为待销毁，将在当前交易结束时被销毁。当前余额转移到给定账户的操作不会失败。
    // 特别的，目标账户的代码（如果有的话）不会被执行，或者，如果账户不存在，余额仍会被添加到给定的地址。
    // 
    // 堆栈输入
    // 地址：发送当前余额到的账户（参见伊斯坦布尔分叉后的BALANCE或SELFBALANCE）。
    [
        0xff,
        function (context) {
            if (context.isStatic) {
                throw new Error("static state change");
            }
            
            const addressBigInt = context.stack.pop();
            const address = bytesToHex(bigintToBytes(addressBigInt));

            return context.interpreter.selfdestruct(address);
        }
    ],
])

function writeReturnData(context, offset, size) {
    const returnData = context.interpreter.getReturnData();

    if (returnData.length > 0) {
        const data = getByteSlice(returnData, BIGINT_0, size);
        context.memory.set(offset, size, data);
    }
}



//  解释器
class Interpreter {
    constructor(transaction, evm) {
        this.context = {
            programCounter: 0,
            codebyte: transaction.codebyte,
            memory: new Memory(),
            stack: new Stack(),
            opCode: 0xfe,
            interpreter: this,
            returnData: null,
            storage: evm.storage,
            from: transaction.from,
            to: transaction.to,
            address: transaction.to,
            origin: transaction.origin,
            callData: hexToBytes(transaction.data),
            callValue: transaction.value,
            evm: evm,
            nonce: transaction.nonce,
            isStatic: transaction.isStatic === true ? true : false,
            log: new Array(),
            status: 'running',
        }
    }

    getCodeSize() {
        return this.context.codebyte.length;
    }

    getCode() {
        return this.context.codebyte;
    }

    getCallValue() {
        return this.context.callValue;
    }

    getCallDataSize() {
        return this.context.callData.length;
    }

    getCallData() {
        return this.context.callData;
    }

    getAddress() {
        return hexToBytes(this.context.to);
    }

    getBalance(addressBigint) {
        const address = bytesToHex(bigintToBytes(addressBigint));
        return evm[address].balance;
    }

    getTxOrigin() {
        return bytesToBigInt(hexToBytes(this.context.origin));
    }

    getCaller() {
        return bytesToBigInt(hexToBytes(this.context.from));
    }

    /**
     * @returns Number
     */
    getReturnDataSize() {
        if (this.context.returnData === null || this.context.returnData === undefined) {
            return 0;
        }
        return this.context.returnData.length;
    }

    /**
     * @returns Uint8Array
     */
    getReturnData() {
        let returnData = new Uint8Array(0);
        if (this.context.returnData !== null && this.context.returnData !== undefined) {
            returnData = this.context.returnData;
        }
        return returnData;
    }

    getBlockNumber() {
        return 1n;
    }

    getBlockGasLimit() {
        return 100000n;
    }

    getChainId() {
        return 50n;
    }

    getSelfBalance() {
        return evm[this.context.to].balance;
    }

    getBlockBaseFee() {
        return 10000n;
    }

    getBlockCoinbase() {
        return BigInt('0x50BF1e4657344267c9293d4B2aD0c8e32dC6aa29');
    }

    getBlockTimestamp() {
        return Date.now();
    }

    create(value, data) {
        const caller = this.context.to;
        this.context.evm.state[this.context.to].nonce += 1;
        const nonce = this.context.evm.state[this.context.to].nonce;

        const fromBytes = hexToBytes(caller);
        const nonceBytes = bigintToBytes(BigInt(nonce));
        const hashBytes = RLP.encode(new Uint8Array([...fromBytes, ...nonceBytes]));
        const hash = keccak256(hashBytes);
        var contractAddress = '0x' + bytesToHex(hash).substring(26);

        console.log("create address : ", contractAddress);

        // 初始化世界状态
        this.context.evm.state[contractAddress] = {
            nonce: 1,
            balance: value,
        }

        let tx = {
            nonce: nonce,
            from: caller,
            to: contractAddress,
            data: bytesToHex(data),
            value: value,
            codebyte: data,
            isCreate: true
        }

        this._call(tx);

        this.context.evm.state[contractAddress].code = this.context.returnData;

        this.context.evm.storage.put(contractAddress);

        return bytesToBigInt(hexToBytes(contractAddress));
    }

    create2(value, initCode, salt) {
        const caller = this.context.to;
        this.context.evm.state[this.context.to].nonce += 1;
        const nonce = this.context.evm.state[this.context.to].nonce;

        // 用CREATE2创建的合约地址由4个部分决定：
        // 0xFF：一个常数，避免和CREATE冲突
        // 创建者地址
        // salt（盐）：一个创建者给定的数值
        // 待部署合约的字节码（bytecode）
        const ffBytes = hexToBytes("0xff");
        const fromBytes = hexToBytes(caller);
        const hash = keccak256(concatBytes(ffBytes, fromBytes, salt, initCode));
        var contractAddress = '0x' + bytesToHex(hash).substring(26);

        console.log("create address : ", contractAddress);

        // 初始化世界状态
        this.context.evm.state[contractAddress] = {
            nonce: 1,
            balance: value,
        }

        let tx = {
            nonce: nonce,
            from: caller,
            to: contractAddress,
            data: bytesToHex(initCode),
            value: value,
            codebyte: initCode,
            isCreate: true
        }

        this._call(tx);

        this.context.evm.state[contractAddress].code = this.context.returnData;

        this.context.evm.storage.put(contractAddress);

        return bytesToBigInt(hexToBytes(contractAddress));
    }

    // 当用户A通过合约B来call合约C的时候，执行的是合约C的函数，
    // 语境(Context，可以理解为包含变量和状态的环境)也是合约C的：msg.sender是B的地址，并且如果函数改变一些状态变量，产生的效果会作用于合约C的变量上。
    call(value, calldata, address) {
        let tx = {
            nonce: 1,
            from: this.context.to,
            to: address,
            data: bytesToHex(calldata),
            value: value,
            codebyte: this.context.evm.state[address].code,
            evm: this.context.evm
        }

        this._call(tx);
        return BIGINT_1;
    }

    // 用户A通过合约B来delegatecall合约C的时候，执行的是合约C的函数，
    // 但是语境仍是合约B的：msg.sender是A的地址，并且如果函数改变一些状态变量，产生的效果会作用于合约B的变量上。
    delegateCall(value, calldata, address) {
        let tx = {
            nonce: 1,
            from: this.context.from,
            to: this.context.to,
            data: bytesToHex(calldata),
            value: value,
            codebyte: this.context.evm.state[address].code,
            evm: this.context.evm,
            isDelegateCall: true
        }

        this._call(tx);
        return BIGINT_1;
    }

    staticCall(value, calldata, address) {
        let tx = {
            nonce: 1,
            from: this.context.to,
            to: address,
            data: bytesToHex(calldata),
            value: value,
            codebyte: this.context.evm.state[address].code,
            isStatic: true
        }

        this._call(tx);
        return BIGINT_1;
    }

    log(data, topicNum, topicBytes) {
        if (topicNum < 0 || topicNum > 4) {
            throw new Error("out of range");
        }

        if (topicNum !== topicBytes.length) {
            throw new Error("wrong log length");
        }

        const log = {
            address: this.context.to,
            topics: topicBytes,
            data: data
        }

        this.context.log.push(log);
    }

    _call(tx) {
        console.log("-----------------------call begin-----------------------");
        this.context.evm.state[tx.from].nonce += 1;

        // let interpreter = new Interpreter(tx, this.context.evm);
        // const returnData = interpreter.run();
        // this.context.returnData = returnData;

        // 保存当前上下文
        const tempInterpreter = this.context.evm.currentInterpreter;
        const result = this.context.evm.execute(tx);
        this.context.evm.currentInterpreter = tempInterpreter;
        result.isCall = true;
        console.log(result);
        this.context.returnData = result.data;
        
        console.log("-----------------------call end-----------------------");
    }

    run() {
        try {
            while (this.context.programCounter < this.context.codebyte.length) {
                const pc = this.context.programCounter;
                const opCode = this.context.codebyte[pc];
                this.context.opCode = opCode;

                console.log(pc, " : ", opcodes[opCode]);

                // console.log(this.context.stack._store);

                let opFunc;
                // 如果为PUSH指令
                if (opCode >= 0x60 && opCode <= 0x7f) {
                    opFunc = opCodeFunctionMap.get(0x60);
                } else if (opCode >= 0x80 && opCode <= 0x8f) {
                    opFunc = opCodeFunctionMap.get(0x80);
                } else if (opCode >= 0x90 && opCode <= 0x9f) {
                    opFunc = opCodeFunctionMap.get(0x90);
                } else {
                    opFunc = opCodeFunctionMap.get(opCode);
                }

                this.context.programCounter++;

                opFunc(this.context);
            }
        } catch (error) {
            console.log(error);
        }

        return this.context.returnData;
    }
}

const WORLD_STATE = { "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5": { nonce: 1, balance: 1000000n, code: null } };
const WORLD_STORAGE = new Storage();

const DEBUG_ALL = 0xff;
const DEBUG_OFF = 0x00;
const DEBUG_STACK = 0x01;
const DEBUG_MEMORY = 0x02;

const EVM = {
    state: WORLD_STATE,
    storage: WORLD_STORAGE,
    getCode: function (address) {
        return WORLD_STATE[address].code;
    },
    step: function (debug = DEBUG_OFF) {
        if (this.currentInterpreter.context.status !== "running" && this.currentInterpreter.context.status !== "paused")
            return { status: -1, message: "no program running" };

        this.debug = debug;

        const pc = this.currentInterpreter.context.programCounter;
        const opCode = this.currentInterpreter.context.codebyte[pc];
        this.currentInterpreter.context.opCode = opCode;

        console.log(pc, " : ", opcodes[opCode]);

        let opFunc;
        // 如果为PUSH指令
        if (opCode >= 0x60 && opCode <= 0x7f) {
            opFunc = opCodeFunctionMap.get(0x60);
        } else if (opCode >= 0x80 && opCode <= 0x8f) {
            opFunc = opCodeFunctionMap.get(0x80);
        } else if (opCode >= 0x90 && opCode <= 0x9f) {
            opFunc = opCodeFunctionMap.get(0x90);
        } else {
            opFunc = opCodeFunctionMap.get(opCode);
        }

        this.currentInterpreter.context.programCounter++;

        if ((this.debug & DEBUG_STACK) === DEBUG_STACK) console.log("stack info: \n" + this.stackInfo());
        if ((this.debug & DEBUG_MEMORY) === DEBUG_MEMORY) console.log("memory info: \n", this.currentInterpreter.context.memory._store);
        // if ((this.debug & DEBUG_MEMORY) === DEBUG_MEMORY) console.log("memory info: \n" + bytesToHex(this.currentInterpreter.context.memory._store));

        return opFunc(this.currentInterpreter.context);
    },

    forward: function (debug = DEBUG_OFF, breakpoint = -1) {
        if (this.currentInterpreter.context.status !== "running" && this.currentInterpreter.context.status !== "paused")
            return { status: -1, message: "no program running" };

        this.debug = debug;

        if (this.currentInterpreter.context.status === "paused")
            this.currentInterpreter.context.status = "running";

        var result = { status: 0, message: "" };

        while (result.status === 0) {
            if (this.debug > 0 && this.currentInterpreter.context.programCounter === breakpoint) {
                this.currentInterpreter.context.status = "paused";
                console.log("break point: " + breakpoint, EVM);
                if ((this.debug & DEBUG_STACK) === DEBUG_STACK) console.log("stack info: \n" + this.stackInfo());
                if ((this.debug & DEBUG_MEMORY) === DEBUG_MEMORY) console.log("memory info: \n", this.currentInterpreter.context.memory._store);
                return { status: -1, message: "paused" };
            }

            const pc = this.currentInterpreter.context.programCounter;
            const opCode = this.currentInterpreter.context.codebyte[pc];
            this.currentInterpreter.context.opCode = opCode;

            // console.log(pc, " : ", opcodes[opCode]);
            // console.log(this.currentInterpreter.context.stack._store);

            let opFunc;
            // 如果为PUSH指令
            if (opCode >= 0x60 && opCode <= 0x7f) {
                opFunc = opCodeFunctionMap.get(0x60);
            } else if (opCode >= 0x80 && opCode <= 0x8f) {
                opFunc = opCodeFunctionMap.get(0x80);
            } else if (opCode >= 0x90 && opCode <= 0x9f) {
                opFunc = opCodeFunctionMap.get(0x90);
            } else {
                opFunc = opCodeFunctionMap.get(opCode);
            }

            this.currentInterpreter.context.programCounter++;

            // TODO 添加返回值
            try {
                opFunc(this.currentInterpreter.context);
            } catch (error) {
                if (error.message === 'RETURNED') {
                    result = { status: 1, message: "RETURNED"};
                } else if (error.message === 'STOP') {
                    result = { status: 2, message: '无返回值' };
                } else if (error.message === 'REVERT') {
                    result = { status: 3, message: error.message };
                } else {
                    console.log(error);
                    result = { status: 4, message: error };
                }
            }
        }

        result.data = this.currentInterpreter.context.returnData;

        // TODO 初始化
        if (result.status === 1) {
            if (this.currentInterpreter.context.address === null) {
                this.state[this.address] = {
                    nonce: 1,
                    balance: 0,
                    code: result.bytes,
                    storage: {}
                }
                this.state[this.tx.origin].nonce += 1
            }
        }

        this.currentInterpreter.context.status = "idle";

        return result;
    },

    execute: function (transaction, debug = DEBUG_OFF, breakpoint = -1) {
        // this.status = "running";

        if (!transaction.isDelegateCall && !transaction.isCreate) {
            transaction.codebyte = transaction.to == null ? hexToBytes(transaction.data) : this.state[transaction.to].code;
        }

        let interpreter;
        if (transaction.to === null) {
            // 计算合约地址
            const fromBytes = hexToBytes(transaction.from);
            const nonceBytes = bigintToBytes(BigInt(transaction.nonce));
            const hashBytes = RLP.encode(new Uint8Array([...fromBytes, ...nonceBytes]));
            const hash = keccak256(hashBytes);
            var contractAddress = '0x' + bytesToHex(hash).substring(26);

            transaction.to = contractAddress;

            interpreter = new Interpreter(transaction, this)
            this.currentInterpreter = interpreter;

            // const returnData = interpreter.run();
            const result = this.forward(debug, breakpoint);

            // 初始化世界状态
            WORLD_STORAGE.put(contractAddress);
            WORLD_STATE[transaction.from].nonce += 1;
            WORLD_STATE[contractAddress] = {
                nonce: 1,
                balance: 0,
                code: result.data,
            }

            console.log("new contract created : " + contractAddress);
            return result;
        } else {
            WORLD_STATE[transaction.from].nonce += 1

            interpreter = new Interpreter(transaction, this)
            // const returnData = interpreter.run();
            this.currentInterpreter = interpreter;
            return this.forward(debug, breakpoint);
        }
    },

    stackInfo: function () {
        return Array.from(this.currentInterpreter.context.stack._store).reverse().reduce((str, value) => (str += bytesToHex(bigintToBytes(value)) + "\n"), "");
    }
}

/*  测试用例
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.0;

    contract Simple {
        uint256 public val1;
        uint256 public val2;

        constructor() {
            val2 = 3;
        }

        function set(uint256 _param) external {
            val1 = _param;
        }

        fallback() external payable {}
    }



var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    // data: "0x608060405234801561000f575f80fd5b50600360018190555061016f806100255f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c806360fe47b11461004357806395cacbe01461005f578063c82fdf361461007d575b5f80fd5b61005d600480360381019061005891906100e6565b61009b565b005b6100676100a4565b6040516100749190610120565b60405180910390f35b6100856100aa565b6040516100929190610120565b60405180910390f35b805f8190555050565b60015481565b5f5481565b5f80fd5b5f819050919050565b6100c5816100b3565b81146100cf575f80fd5b50565b5f813590506100e0816100bc565b92915050565b5f602082840312156100fb576100fa6100af565b5b5f610108848285016100d2565b91505092915050565b61011a816100b3565b82525050565b5f6020820190506101335f830184610111565b9291505056fea264697066735822122005c408db9d51b7388bee0e40bd0d42dfa065917597528e34f06f8d43578a302c64736f6c63430008150033",
    data: "0x608060405234801561000f575f80fd5b50600360018190555061018a806100255f395ff3fe608060405260043610610037575f3560e01c806360fe47b11461003a57806395cacbe014610062578063c82fdf361461008c57610038565b5b005b348015610045575f80fd5b50610060600480360381019061005b9190610101565b6100b6565b005b34801561006d575f80fd5b506100766100bf565b604051610083919061013b565b60405180910390f35b348015610097575f80fd5b506100a06100c5565b6040516100ad919061013b565b60405180910390f35b805f8190555050565b60015481565b5f5481565b5f80fd5b5f819050919050565b6100e0816100ce565b81146100ea575f80fd5b50565b5f813590506100fb816100d7565b92915050565b5f60208284031215610116576101156100ca565b5b5f610123848285016100ed565b91505092915050565b610135816100ce565b82525050565b5f60208201905061014e5f83018461012c565b9291505056fea26469706673582212203a365fa55e529a903c5fbdecfde628f40c6de7ed8225391318b8c9b58a99099364736f6c63430008150033",
    value: 0n
}

var setTransaction = {
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0x60fe47b1000000000000000000000000000000000000000000000000000000000000000c",
    value: 0n
}

var getVal1Transaction = {
    nonce: 3,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0xc82fdf36",
    value: 0n
}

var getVal2Transaction = {
    nonce: 4,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0x95cacbe0",
    value: 0n
}

var fallbackTransaction = {
    nonce: 5,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0x",
    value: 100n
}

console.log("\n部署合约，初始化 val2 = 3\n")

console.log(EVM.execute(transaction, DEBUG_ALL));

console.log("\n调用set方法，设置 val1 = 12 \n")

console.log(EVM.execute(setTransaction, DEBUG_ALL, 14));

console.log(EVM.step(DEBUG_STACK));
console.log(EVM.step(DEBUG_ALL));
console.log(EVM.step(DEBUG_ALL));
console.log(EVM.forward(DEBUG_ALL));


console.log("\n调用get方法，获取val1的值 \n")

console.log(EVM.execute(getVal1Transaction, DEBUG_ALL));

console.log("\n调用get方法，获取val2的值 \n")

console.log(EVM.execute(getVal2Transaction));

console.log("")
*/

// 貌似转账功能不是通过指令实现
// 加入fallback函数以后，如果交易数据字段的前4字节与任何函数选择器都不匹配，则程序计数器会跳转到55这里(在这个示例中)。
// 这是后备函数：这个函数是空的，所以接下来是STOP。STOP：表示交易执行成功。
// 现在，每个函数都需要检查交易值字段，除非该函数不可支付。
// console.log("\n转账，触发fallback \n")
// EVM.run(fallbackTransaction);

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageLayout {
    bytes1 private valByte;
    uint256 private valUint256a;
    uint32 private valUint32;
    uint64 private valUint64;
    address private valAddress;
    uint256 private valUint256b;

    function set() external {
        valByte = 0x10;
        valUint256a = 0x11;
        valUint32 = 0x12;
        valUint64 = 0x13;
        valAddress = address(0x14);
        valUint256b = 0x15;
    }
}


var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x6080604052348015600e575f80fd5b506101248061001c5f395ff3fe6080604052348015600e575f80fd5b50600436106026575f3560e01c8063b8e010de14602a575b5f80fd5b60306032565b005b601060f81b5f806101000a81548160ff021916908360f81c02179055506011600181905550601260025f6101000a81548163ffffffff021916908363ffffffff1602179055506013600260046101000a81548167ffffffffffffffff021916908367ffffffffffffffff16021790555060146002600c6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550601560038190555056fea26469706673582212209a7be6580c5bc887f5caa4a9e37e356cf0e860f951fe1414d3c1820c610069be64736f6c63430008150033",
    value: 0n
}

var setTransaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0xb8e010de",
    value: 0n
}

EVM.execute(transaction, DEBUG_ALL);

EVM.execute(setTransaction, DEBUG_ALL);

console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", 0n))))
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", 1n))))
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", 2n))))
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", 3n))))
*/

/*

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageBytes {
    bytes private valBytes;

    function setBytes(bytes1 _val) external {
        valBytes.push(_val);
    }
}



var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506101fe8061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c8063e4e38de31461002d575b5f80fd5b61004760048036038101906100429190610140565b610049565b005b5f81908080548061005990610198565b80601f810361007657835f5260205f2060ff1984168155603f9350505b506002820183556001810192505050600190038154600116156100a657905f5260205f2090602091828204019190065b909190919091601f036101000a81548160ff021916907f01000000000000000000000000000000000000000000000000000000000000008404021790555050565b5f80fd5b5f7fff0000000000000000000000000000000000000000000000000000000000000082169050919050565b61011f816100eb565b8114610129575f80fd5b50565b5f8135905061013a81610116565b92915050565b5f60208284031215610155576101546100e7565b5b5f6101628482850161012c565b91505092915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f60028204905060018216806101af57607f821691505b6020821081036101c2576101c161016b565b5b5091905056fea2646970667358221220a616bf1f7007e859f42bf6eba22f265ddfc8019403a222db93c165dfc70a760164736f6c63430008150033",
    value: 0n
}

var setBytesTransaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0xe4e38de3aa00000000000000000000000000000000000000000000000000000000000000",
    value: 0n
}

EVM.execute(transaction, DEBUG_ALL);

// 当字节数超过31字节，slot存储的是长度 + 标志位1，数据位置在keccak256(slot)、keccak256(slot) + 1
for (let index = 0; index < 34; index++) {
    EVM.execute(setBytesTransaction, DEBUG_ALL);
    console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", 0n))));
}
var a = bytesToBigInt(keccak256(new Uint8Array(32)));
var b = bytesToBigInt(keccak256(new Uint8Array(32))) + 1n;
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", a))));
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", b))));
*/

/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageArrays {
    uint256[] private arrayUint256;
    bytes1[] private arrayByte;

    function setUint256ArrayVal(uint256 _ofs, uint256 _val) external {
        arrayUint256[_ofs] = _val;
    }

    function setByteArrayVal(uint256 _ofs, bytes1 _val) external {
        arrayByte[_ofs] = _val;
    }
}


// 动态数组的值存储在以下位置：storage[keccak256(slot)+key] = value
// 动态数组中的元素数量存储在 storage[slot]
var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102408061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c8063778b589214610038578063da1e128e14610054575b5f80fd5b610052600480360381019061004d9190610161565b610070565b005b61006e6004803603810190610069919061019f565b6100b1565b005b8060018381548110610085576100846101dd565b5b905f5260205f2090602091828204019190066101000a81548160ff021916908360f81c02179055505050565b805f83815481106100c5576100c46101dd565b5b905f5260205f2001819055505050565b5f80fd5b5f819050919050565b6100eb816100d9565b81146100f5575f80fd5b50565b5f81359050610106816100e2565b92915050565b5f7fff0000000000000000000000000000000000000000000000000000000000000082169050919050565b6101408161010c565b811461014a575f80fd5b50565b5f8135905061015b81610137565b92915050565b5f8060408385031215610177576101766100d5565b5b5f610184858286016100f8565b92505060206101958582860161014d565b9150509250929050565b5f80604083850312156101b5576101b46100d5565b5b5f6101c2858286016100f8565b92505060206101d3858286016100f8565b9150509250929050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffdfea2646970667358221220ae9c32aa4eae98b29d153af4f79d9a1434944e58fb1828d207fdc0afd58d3d1e64736f6c63430008150033",
    value: 0n
}

var setUint256ArrayValTx = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0xda1e128e000000000000000000000000000000000000000000000000000000000000006f0000000000000000000000000000000000000000000000000000000000002af8",
    value: 0n
}

var setByteArrayValTx = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0x778b589200000000000000000000000000000000000000000000000000000000000003e8e100000000000000000000000000000000000000000000000000000000000000",
    value: 0n
}

EVM.execute(transaction, DEBUG_ALL);
EVM.execute(setUint256ArrayValTx, DEBUG_ALL);
EVM.execute(setByteArrayValTx, DEBUG_ALL);

console.log(EVM.storage);
console.log();
*/

/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageMappings {
    mapping(uint256 => uint256) private map;

    function setMapVal(uint256 _key, uint256 _val) external {
        map[_key] = _val;
    }
}


var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561001057600080fd5b506101c2806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80634dcb6e681461003b578063b8dda9c714610057575b600080fd5b610055600480360381019061005091906100f5565b610087565b005b610071600480360381019061006c9190610135565b6100a2565b60405161007e9190610171565b60405180910390f35b80600080848152602001908152602001600020819055505050565b60006020528060005260406000206000915090505481565b600080fd5b6000819050919050565b6100d2816100bf565b81146100dd57600080fd5b50565b6000813590506100ef816100c9565b92915050565b6000806040838503121561010c5761010b6100ba565b5b600061011a858286016100e0565b925050602061012b858286016100e0565b9150509250929050565b60006020828403121561014b5761014a6100ba565b5b6000610159848285016100e0565b91505092915050565b61016b816100bf565b82525050565b60006020820190506101866000830184610162565b9291505056fea264697066735822122037246619b06bbf96fe04f910e0ba91be3d66e85b5609d6d88932ee264c025c3964736f6c63430008090033",
    value: 0n
}

var setMapValTx = {
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0x4dcb6e68000000000000000000000000000000000000000000000000000000000000006f0000000000000000000000000000000000000000000000000000000000002af8",// 111:11000
    value: 0n
}

var getMapValTx = {
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x80cc7c6d638660b0f715af94ed2e88eae37c09c3",
    data: "0xb8dda9c7000000000000000000000000000000000000000000000000000000000000006f",// 111
    value: 0n
}

console.log(EVM.execute(transaction));
console.log(EVM.execute(setMapValTx));
console.log(EVM.execute(getMapValTx));

// Mappings的存储
// storage[keccak256(key . storage slot number)] = value
const arr = new Uint8Array(64);
arr[31] = 111;
console.log(WORLD_STORAGE.get("0x80cc7c6d638660b0f715af94ed2e88eae37c09c3", bytesToBigInt(keccak256(arr))));
*/

/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CallContract {
    function callSetX(address _addr, uint256 x) public {
        // call setX()
        (bool success, bytes memory data) = _addr.call(abi.encodeWithSignature("setX(uint256)", x));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OtherContract {
    uint256 private _x = 0; // 状态变量x
    
    // 可以调整状态变量_x的函数
    function setX(uint256 x) external {
        _x = x;
    }

    // 读取x
    function getX() external view returns(uint x){
        x = _x;
    }
}


var callDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102f58061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c80633ca065bb1461002d575b5f80fd5b610047600480360381019061004291906101d7565b610049565b005b5f808373ffffffffffffffffffffffffffffffffffffffff16836040516024016100739190610224565b6040516020818303038152906040527f4018d9aa000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516100fd91906102a9565b5f604051808303815f865af19150503d805f8114610136576040519150601f19603f3d011682016040523d82523d5f602084013e61013b565b606091505b509150915050505050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6101738261014a565b9050919050565b61018381610169565b811461018d575f80fd5b50565b5f8135905061019e8161017a565b92915050565b5f819050919050565b6101b6816101a4565b81146101c0575f80fd5b50565b5f813590506101d1816101ad565b92915050565b5f80604083850312156101ed576101ec610146565b5b5f6101fa85828601610190565b925050602061020b858286016101c3565b9150509250929050565b61021e816101a4565b82525050565b5f6020820190506102375f830184610215565b92915050565b5f81519050919050565b5f81905092915050565b5f5b8381101561026e578082015181840152602081019050610253565b5f8484015250505050565b5f6102838261023d565b61028d8185610247565b935061029d818560208601610251565b80840191505092915050565b5f6102b48284610279565b91508190509291505056fea26469706673582212201ab248bd04b88fb539ca092e6345a11ebea8295cec99d55a379cd59e4dbd279564736f6c63430008150033",
    value: 0n
}

var otherDeploy = {
    nonce: 10001,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x60806040525f8055348015610012575f80fd5b50610143806100205f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80634018d9aa146100385780635197c7aa14610054575b5f80fd5b610052600480360381019061004d91906100ba565b610072565b005b61005c61007b565b60405161006991906100f4565b60405180910390f35b805f8190555050565b5f8054905090565b5f80fd5b5f819050919050565b61009981610087565b81146100a3575f80fd5b50565b5f813590506100b481610090565b92915050565b5f602082840312156100cf576100ce610083565b5b5f6100dc848285016100a6565b91505092915050565b6100ee81610087565b82525050565b5f6020820190506101075f8301846100e5565b9291505056fea26469706673582212200da2d2b22b4f06459529e26a849eac17f2c0a610f4f13d6665bf5c708df0f18a64736f6c63430008150033",
    value: 0n
}

var callTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x3ca065bb00000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007c",
    value: 0n
}

var getTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x23983b78d50a8e652cd0ff1e109ef39ff6596111",
    data: "0x5197c7aa",
    value: 0n
}

console.log(EVM.execute(callDeploy, DEBUG_ALL));
console.log(EVM.execute(otherDeploy, DEBUG_ALL));
console.log(EVM.execute(callTx, DEBUG_ALL));
console.log(EVM.execute(getTx, DEBUG_ALL));
console.log();
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract C {
    uint public num;
    address public sender;

    function setVars(uint _num) public payable {
        num = _num;
        sender = msg.sender;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract B {
    uint public num;
    address public sender;

    // 通过call来调用C的setVars()函数，将改变合约C里的状态变量
    function callSetVars(address _addr, uint _num) external payable{
        // call setVars()
        (bool success, bytes memory data) = _addr.call(
            abi.encodeWithSignature("setVars(uint256)", _num)
        );
    }

    // 通过delegatecall来调用C的setVars()函数，将改变合约B里的状态变量
    function delegatecallSetVars(address _addr, uint _num) external payable{
        // delegatecall setVars()
        (bool success, bytes memory data) = _addr.delegatecall(
            abi.encodeWithSignature("setVars(uint256)", _num)
        );
    }
}
*/


var BDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506104bc8061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80631c1cba571461004e5780634e70b1dc1461006a57806367e404ce14610088578063b39a9641146100a6575b5f80fd5b61006860048036038101906100639190610376565b6100c2565b005b6100726101be565b60405161007f91906103c3565b60405180910390f35b6100906101c3565b60405161009d91906103eb565b60405180910390f35b6100c060048036038101906100bb9190610376565b6101e8565b005b5f808373ffffffffffffffffffffffffffffffffffffffff16836040516024016100ec91906103c3565b6040516020818303038152906040527f6466414b000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516101769190610470565b5f60405180830381855af49150503d805f81146101ae576040519150601f19603f3d011682016040523d82523d5f602084013e6101b3565b606091505b509150915050505050565b5f5481565b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f808373ffffffffffffffffffffffffffffffffffffffff168360405160240161021291906103c3565b6040516020818303038152906040527f6466414b000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff838183161783525050505060405161029c9190610470565b5f604051808303815f865af19150503d805f81146102d5576040519150601f19603f3d011682016040523d82523d5f602084013e6102da565b606091505b509150915050505050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610312826102e9565b9050919050565b61032281610308565b811461032c575f80fd5b50565b5f8135905061033d81610319565b92915050565b5f819050919050565b61035581610343565b811461035f575f80fd5b50565b5f813590506103708161034c565b92915050565b5f806040838503121561038c5761038b6102e5565b5b5f6103998582860161032f565b92505060206103aa85828601610362565b9150509250929050565b6103bd81610343565b82525050565b5f6020820190506103d65f8301846103b4565b92915050565b6103e581610308565b82525050565b5f6020820190506103fe5f8301846103dc565b92915050565b5f81519050919050565b5f81905092915050565b5f5b8381101561043557808201518184015260208101905061041a565b5f8484015250505050565b5f61044a82610404565b610454818561040e565b9350610464818560208601610418565b80840191505092915050565b5f61047b8284610440565b91508190509291505056fea264697066735822122015c4d211d019fe776b614a588b2b8676a34f86b0417adfc60ab316b8bcd3c67664736f6c63430008150033",
    value: 0n
}

var CDeploy = {
    nonce: 10001,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102268061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80634e70b1dc146100435780636466414b1461006157806367e404ce1461007d575b5f80fd5b61004b61009b565b6040516100589190610126565b60405180910390f35b61007b6004803603810190610076919061016d565b6100a0565b005b6100856100e9565b60405161009291906101d7565b60405180910390f35b5f5481565b805f819055503360015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f819050919050565b6101208161010e565b82525050565b5f6020820190506101395f830184610117565b92915050565b5f80fd5b61014c8161010e565b8114610156575f80fd5b50565b5f8135905061016781610143565b92915050565b5f602082840312156101825761018161013f565b5b5f61018f84828501610159565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6101c182610198565b9050919050565b6101d1816101b7565b82525050565b5f6020820190506101ea5f8301846101c8565b9291505056fea2646970667358221220c8fc00a70cf7aa5222da968ffa0d664d764cfc9876839cd9fede5788d3931c4664736f6c63430008150033",
    value: 0n
}

var delegatecallTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x1c1cba5700000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007b",
    value: 0n
}

var getBNumTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x4e70b1dc",
    value: 0n
}

var getBSenderTx = {
    nonce: 10004,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x67e404ce",
    value: 0n
}

var getCNumTx = {
    nonce: 10005,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x23983b78d50a8e652cd0ff1e109ef39ff6596111",
    data: "0x4e70b1dc",
    value: 0n
}

var getCSenderTx = {
    nonce: 10006,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x23983b78d50a8e652cd0ff1e109ef39ff6596111",
    data: "0x67e404ce",
    value: 0n
}

console.log(EVM.execute(BDeploy));
console.log(EVM.execute(CDeploy));
console.log(EVM.execute(delegatecallTx));
console.log(bytesToHex(EVM.execute(getBNumTx).data));
console.log(bytesToHex(EVM.execute(getBSenderTx).data));
console.log(bytesToHex(EVM.execute(getCNumTx).data));
console.log(bytesToHex(EVM.execute(getCSenderTx).data));
console.log();

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Pair{
    address public factory; // 工厂合约地址
    address public token0; // 代币1
    address public token1; // 代币2

    constructor() payable {
        factory = msg.sender;
    }

    // called once by the factory at time of deployment
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, 'UniswapV2: FORBIDDEN'); // sufficient check
        token0 = _token0;
        token1 = _token1;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Pair.sol";

contract PairFactory{
    mapping(address => mapping(address => address)) public getPair; // 通过两个代币地址查Pair地址
    address[] public allPairs; // 保存所有Pair地址

    function createPair(address tokenA, address tokenB) external returns (address pairAddr) {
        // 创建新合约
        Pair pair = new Pair(); 
        // 调用新合约的initialize方法
        pair.initialize(tokenA, tokenB);
        // 更新地址map
        pairAddr = address(pair);
        allPairs.push(pairAddr);
        getPair[tokenA][tokenB] = pairAddr;
        getPair[tokenB][tokenA] = pairAddr;
    }
}

var factoryDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506109408061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80631e3dd18b14610043578063c9c6539614610073578063e6a43905146100a3575b5f80fd5b61005d600480360381019061005891906103f4565b6100d3565b60405161006a919061045e565b60405180910390f35b61008d600480360381019061008891906104a1565b61010e565b60405161009a919061045e565b60405180910390f35b6100bd60048036038101906100b891906104a1565b610374565b6040516100ca919061045e565b60405180910390f35b600181815481106100e2575f80fd5b905f5260205f20015f915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8060405161011c906103b0565b604051809103905ff080158015610135573d5f803e3d5ffd5b5090508073ffffffffffffffffffffffffffffffffffffffff1663485cc95585856040518363ffffffff1660e01b81526004016101739291906104df565b5f604051808303815f87803b15801561018a575f80fd5b505af115801561019c573d5f803e3d5ffd5b50505050809150600182908060018154018082558091505060019003905f5260205f20015f9091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550815f808673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550815f808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505092915050565b5f602052815f5260405f20602052805f5260405f205f915091509054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6104048061050783390190565b5f80fd5b5f819050919050565b6103d3816103c1565b81146103dd575f80fd5b50565b5f813590506103ee816103ca565b92915050565b5f60208284031215610409576104086103bd565b5b5f610416848285016103e0565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6104488261041f565b9050919050565b6104588161043e565b82525050565b5f6020820190506104715f83018461044f565b92915050565b6104808161043e565b811461048a575f80fd5b50565b5f8135905061049b81610477565b92915050565b5f80604083850312156104b7576104b66103bd565b5b5f6104c48582860161048d565b92505060206104d58582860161048d565b9150509250929050565b5f6040820190506104f25f83018561044f565b6104ff602083018461044f565b939250505056fe6080604052335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506103b4806100505f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80630dfe16811461004e578063485cc9551461006c578063c45a015514610088578063d21220a7146100a6575b5f80fd5b6100566100c4565b6040516100639190610281565b60405180910390f35b610086600480360381019061008191906102c8565b6100e9565b005b6100906101fa565b60405161009d9190610281565b60405180910390f35b6100ae61021d565b6040516100bb9190610281565b60405180910390f35b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610176576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161016d90610360565b60405180910390fd5b8160015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508060025f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60025f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61026b82610242565b9050919050565b61027b81610261565b82525050565b5f6020820190506102945f830184610272565b92915050565b5f80fd5b6102a781610261565b81146102b1575f80fd5b50565b5f813590506102c28161029e565b92915050565b5f80604083850312156102de576102dd61029a565b5b5f6102eb858286016102b4565b92505060206102fc858286016102b4565b9150509250929050565b5f82825260208201905092915050565b7f556e697377617056323a20464f5242494444454e0000000000000000000000005f82015250565b5f61034a601483610306565b915061035582610316565b602082019050919050565b5f6020820190508181035f8301526103778161033e565b905091905056fea26469706673582212207a956edd919e963b557828a9510257a37cd5959d60fb5473f124d0de1e79204564736f6c63430008150033a2646970667358221220fc76891a60f231ff0b99cb785892b85919314834a6def28b468fa0d13af31c5e64736f6c63430008150033",
    value: 0n
}

// createPair(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var createPairTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0xc9c65396000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

// getPair(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var getPairTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0xe6a43905000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

var getToken0Tx = {
    nonce: 10004,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x4f9cf3addeb9bb5be1dc5181c3644ee28801c922",
    data: "0x0dfe1681",
    value: 0n
}

var getToken1Tx = {
    nonce: 10005,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x4f9cf3addeb9bb5be1dc5181c3644ee28801c922",
    data: "0xd21220a7",
    value: 0n
}

console.log(EVM.execute(factoryDeploy));
console.log(EVM.execute(createPairTx));
console.log(bytesToHex(EVM.execute(getPairTx).data));
console.log(bytesToHex(EVM.execute(getToken0Tx).data));
console.log(bytesToHex(EVM.execute(getToken1Tx).data));
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Pair.sol";

contract PairFactory2 {
    mapping(address => mapping(address => address)) public getPair; // 通过两个代币地址查Pair地址
    address[] public allPairs; // 保存所有Pair地址

    function createPair2(address tokenA, address tokenB)
        external
        returns (address pairAddr)
    {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES"); //避免tokenA和tokenB相同产生的冲突
        // 计算用tokenA和tokenB地址计算salt
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA); //将tokenA和tokenB按大小排序
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        // 用create2部署新合约
        Pair pair = new Pair{salt: salt}();
        // 调用新合约的initialize方法
        pair.initialize(tokenA, tokenB);
        // 更新地址map
        pairAddr = address(pair);
        allPairs.push(pairAddr);
        getPair[tokenA][tokenB] = pairAddr;
        getPair[tokenB][tokenA] = pairAddr;
    }
}


var factoryDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b50610b0d8061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80631e3dd18b146100435780639385018714610073578063e6a43905146100a3575b5f80fd5b61005d600480360381019061005891906104d9565b6100d3565b60405161006a9190610543565b60405180910390f35b61008d60048036038101906100889190610586565b61010e565b60405161009a9190610543565b60405180910390f35b6100bd60048036038101906100b89190610586565b610459565b6040516100ca9190610543565b60405180910390f35b600181815481106100e2575f80fd5b905f5260205f20015f915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff160361017d576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016101749061061e565b60405180910390fd5b5f808373ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff16106101b95783856101bc565b84845b915091505f82826040516020016101d4929190610681565b6040516020818303038152906040528051906020012090505f816040516101fa90610495565b8190604051809103905ff5905080158015610217573d5f803e3d5ffd5b5090508073ffffffffffffffffffffffffffffffffffffffff1663485cc95588886040518363ffffffff1660e01b81526004016102559291906106ac565b5f604051808303815f87803b15801561026c575f80fd5b505af115801561027e573d5f803e3d5ffd5b50505050809450600185908060018154018082558091505060019003905f5260205f20015f9091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550845f808973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8873ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550845f808873ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050505092915050565b5f602052815f5260405f20602052805f5260405f205f915091509054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b610404806106d483390190565b5f80fd5b5f819050919050565b6104b8816104a6565b81146104c2575f80fd5b50565b5f813590506104d3816104af565b92915050565b5f602082840312156104ee576104ed6104a2565b5b5f6104fb848285016104c5565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61052d82610504565b9050919050565b61053d81610523565b82525050565b5f6020820190506105565f830184610534565b92915050565b61056581610523565b811461056f575f80fd5b50565b5f813590506105808161055c565b92915050565b5f806040838503121561059c5761059b6104a2565b5b5f6105a985828601610572565b92505060206105ba85828601610572565b9150509250929050565b5f82825260208201905092915050565b7f4944454e544943414c5f414444524553534553000000000000000000000000005f82015250565b5f6106086013836105c4565b9150610613826105d4565b602082019050919050565b5f6020820190508181035f830152610635816105fc565b9050919050565b5f8160601b9050919050565b5f6106528261063c565b9050919050565b5f61066382610648565b9050919050565b61067b61067682610523565b610659565b82525050565b5f61068c828561066a565b60148201915061069c828461066a565b6014820191508190509392505050565b5f6040820190506106bf5f830185610534565b6106cc6020830184610534565b939250505056fe6080604052335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506103b4806100505f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80630dfe16811461004e578063485cc9551461006c578063c45a015514610088578063d21220a7146100a6575b5f80fd5b6100566100c4565b6040516100639190610281565b60405180910390f35b610086600480360381019061008191906102c8565b6100e9565b005b6100906101fa565b60405161009d9190610281565b60405180910390f35b6100ae61021d565b6040516100bb9190610281565b60405180910390f35b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610176576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161016d90610360565b60405180910390fd5b8160015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508060025f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60025f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61026b82610242565b9050919050565b61027b81610261565b82525050565b5f6020820190506102945f830184610272565b92915050565b5f80fd5b6102a781610261565b81146102b1575f80fd5b50565b5f813590506102c28161029e565b92915050565b5f80604083850312156102de576102dd61029a565b5b5f6102eb858286016102b4565b92505060206102fc858286016102b4565b9150509250929050565b5f82825260208201905092915050565b7f556e697377617056323a20464f5242494444454e0000000000000000000000005f82015250565b5f61034a601483610306565b915061035582610316565b602082019050919050565b5f6020820190508181035f8301526103778161033e565b905091905056fea2646970667358221220ff8d578375d132b6ea9a442465bef2f91c7b7c323cc532909299f545f15e042a64736f6c63430008150033a2646970667358221220ece2f1bc303bcf1d4725cf022d580fbbf096ce9eeb3a2413098a3dfbd1c9bc4464736f6c63430008150033",
    value: 0n
}

// createPair2(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var createPair2Tx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x93850187000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

// getPair(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var getPairTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0xe6a43905000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

var getToken0Tx = {
    nonce: 10004,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xf94f64a24c77e26e8cda23f48af9bb7f8fb923dc",
    data: "0x0dfe1681",
    value: 0n
}

var getToken1Tx = {
    nonce: 10005,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xf94f64a24c77e26e8cda23f48af9bb7f8fb923dc",
    data: "0xd21220a7",
    value: 0n
}

console.log(EVM.execute(factoryDeploy));
console.log(EVM.execute(createPair2Tx));
console.log(bytesToHex(EVM.execute(getPairTx).data));
console.log(bytesToHex(EVM.execute(getToken0Tx).data));
console.log(bytesToHex(EVM.execute(getToken1Tx).data));
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CallContract {
    function callSetX(address _addr, uint256 x) public {
        // call setX()
        (bool success, bytes memory data) = _addr.staticcall(abi.encodeWithSignature("setX(uint256)", x));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OtherContract {
    uint256 private _x = 0; // 状态变量x
    
    // 可以调整状态变量_x的函数
    function setX(uint256 x) external {
        _x = x;
    }

    // 读取x
    function getX() external view returns(uint x){
        x = _x;
    }
}


var callDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102f48061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c80633ca065bb1461002d575b5f80fd5b610047600480360381019061004291906101d6565b610049565b005b5f808373ffffffffffffffffffffffffffffffffffffffff16836040516024016100739190610223565b6040516020818303038152906040527f4018d9aa000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516100fd91906102a8565b5f60405180830381855afa9150503d805f8114610135576040519150601f19603f3d011682016040523d82523d5f602084013e61013a565b606091505b509150915050505050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61017282610149565b9050919050565b61018281610168565b811461018c575f80fd5b50565b5f8135905061019d81610179565b92915050565b5f819050919050565b6101b5816101a3565b81146101bf575f80fd5b50565b5f813590506101d0816101ac565b92915050565b5f80604083850312156101ec576101eb610145565b5b5f6101f98582860161018f565b925050602061020a858286016101c2565b9150509250929050565b61021d816101a3565b82525050565b5f6020820190506102365f830184610214565b92915050565b5f81519050919050565b5f81905092915050565b5f5b8381101561026d578082015181840152602081019050610252565b5f8484015250505050565b5f6102828261023c565b61028c8185610246565b935061029c818560208601610250565b80840191505092915050565b5f6102b38284610278565b91508190509291505056fea2646970667358221220e6073d99e8cbc7b17313b034d5c1b908023cc921495c9ce75acbd52eebc464c664736f6c63430008150033",
    value: 0n
}

var otherDeploy = {
    nonce: 10001,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x60806040525f8055348015610012575f80fd5b50610143806100205f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80634018d9aa146100385780635197c7aa14610054575b5f80fd5b610052600480360381019061004d91906100ba565b610072565b005b61005c61007b565b60405161006991906100f4565b60405180910390f35b805f8190555050565b5f8054905090565b5f80fd5b5f819050919050565b61009981610087565b81146100a3575f80fd5b50565b5f813590506100b481610090565b92915050565b5f602082840312156100cf576100ce610083565b5b5f6100dc848285016100a6565b91505092915050565b6100ee81610087565b82525050565b5f6020820190506101075f8301846100e5565b9291505056fea26469706673582212200da2d2b22b4f06459529e26a849eac17f2c0a610f4f13d6665bf5c708df0f18a64736f6c63430008150033",
    value: 0n
}

var callTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x3ca065bb00000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007c",
    value: 0n
}

EVM.execute(callDeploy);
EVM.execute(otherDeploy);
EVM.execute(callTx);
*/






