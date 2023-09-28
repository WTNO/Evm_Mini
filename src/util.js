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

export function bytesToHex(bytes) {
    let hex = '0x'
    if (bytes === undefined || bytes.length === 0) return hex
    for (const byte of bytes) {
        hex += hexByByte[byte]
    }
    return hex
}