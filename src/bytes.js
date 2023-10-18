import { BIGINT_0 } from "./constants.js";

export function concatBytes(...arrs) {
    if (arrs.length == 1) return arrs[0];

    // 计算传入数组总长度
    const length = arrs.reduce((total, arr) => {
        if (typeof arr != Uint8Array) {
            throw new Error('The arrs parameter must be of type Uint8Array')
        }
        total + arr.length
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
export function hexToBytes(hexStr) {
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
export function bytesToHex(bytes) {
    let hex = '0x'
    if (bytes === undefined || bytes.length === 0) return hex
    for (const byte of bytes) {
        hex += hexByByte[byte]
    }
    return hex
}

// Uint8Array 转 BigInt 
// bytes[0]是最大端，bytes[bytes.length - 1]是最小端
export function bytesToBigInt(bytes) {
    if (typeof bytes !== 'Uint8Array') {
        throw new Error('Input type is not Uint8Array');
    }
    const hex = bytesToHex(bytes);
    if (hex === '0x') {
        return BIGINT_0;
    }

    return BigInt(hex);
}

// BigInt 转 Uint8Array
export function bigintToBytes(data) {
    if (typeof data !== 'bigint') {
        throw new Error('Input type is not BigInt');
    }

    // 转为16进制字符串
    const hex = data.toString(16);

    // 填充到偶数位数
    if (hex.length % 2) {
        hex = '0' + hex;
    }

    return hexToBytes('0x' + hex);
}

// 左边补0
export function padZeroOnLeft(data, length) {
    // 输入类型必须为Uint8Array
    if (!(data instanceof Uint8Array)) {
        throw new Error('input type must be Uint8Array');
    }

    if (data.length < length) {
        const zeros = new Uint8Array(length - data.length);
        return new Uint8Array([...zeros, ...msg]);
    }
    return data.subarray(-length);
}