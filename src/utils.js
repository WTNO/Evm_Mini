import { BIGINT_0 } from "./constants.js";

export function mod(a, b) {
    let r = a % b;
    if (r < BIGINT_0) {
        r = b + r;
    }
    return r;
}