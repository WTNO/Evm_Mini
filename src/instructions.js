import { bytesToHex } from "./bytes";
import { BIGINT_0, BIGINT_1, BIGINT_255, BIGINT_256, BIGINT_31, BIGINT_32, BIGINT_7, BIGINT_8, MAX_INTEGER_BIGINT, TWO_POW256 } from "./constants";
import { mod } from "./utils";
import { keccak256 } from "https://raw.githubusercontent.com/ethereum/js-ethereum-cryptography/master/src/keccak.ts";

// 指令集

export const opCodeFunctionMap = new Map([
    // STOP
    [
        0x00,
        function () {
            throw new Error('STOP INSTRUCTION');
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
            context.stack.push(BigInt.asIntN(a) < BigInt.asIntN(b) ? BIGINT_1 : BIGINT_0);
        }
    ],
    // SGT 所有值都被视为二进制补码有符号的256位整数。
    [
        0x13,
        function (context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(BigInt.asIntN(a) > BigInt.asIntN(b) ? BIGINT_1 : BIGINT_0);
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

            if (size !== BIGINT_0) {
                data = context.memory.read(Number(offset), Number(size));
            }
            const r = BigInt(bytesToHex(keccak256(data)));
            context.stack.push(r);
        }
    ],
])