import { bigintToBytes, bytesToBigInt, bytesToHex, padZeroOnLeft, padZeroOnRight } from "./bytes.js";
import { BIGINT_0, BIGINT_1, BIGINT_255, BIGINT_256, BIGINT_2EXP256, BIGINT_31, BIGINT_32, BIGINT_7, BIGINT_8, MAX_INTEGER_BIGINT, TWO_POW256 } from "./constants.js";
import { getByteSlice, isJumpdest, mod } from "./utils.js";
import { keccak256 } from 'ethereum-cryptography/keccak.js'


// 指令集

export const opCodeFunctionMap = new Map([
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

function calMemoryWordCount(context, offset, length) {
}