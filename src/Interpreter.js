import { keccak256 } from "ethereum-cryptography/keccak.js";
import { bigintToBytes, bytesToBigInt, bytesToHex, concatBytes, hexToBytes } from "./bytes.js";
import { BIGINT_1 } from "./constants.js";
import { opCodeFunctionMap } from "./instructions.js";
import { Memory } from "./memory.js";
import { Stack } from "./stack.js";
import { RLP } from "@ethereumjs/rlp";
import { opcodes } from "./opcode.js";

//  解释器
export class Interpreter {
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
            codebyte: data
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
            codebyte: initCode
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

                console.log(this.context.stack._store);

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