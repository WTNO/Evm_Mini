import { padZeroOnRight } from "./bytes.js";
import { BIGINT_0 } from "./constants.js";

export function mod(a, b) {
    let r = a % b;
    if (r < BIGINT_0) {
        r = b + r;
    }
    return r;
}

export function getByteSlice(bytes, offset, size) {
    if (!(bytes instanceof Uint8Array)) {
        throw new Error('Input type is not Uint8Array');
    }

    const len = BigInt(bytes.length);

    let end = offset + size;

    if (end > bytes.length) {
        end = bytes.length;
    }

    const data = padZeroOnRight(bytes.subarray(begin, end), size);

    return data;
}