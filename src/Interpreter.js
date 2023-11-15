import { bigintToBytes, bytesToBigInt, bytesToHex, hexToBytes } from "./bytes.js";
import { opCodeFunctionMap } from "./instructions.js";
import { Memory } from "./memory.js";
import { opcodes } from "./opcode.js";
import { Stack } from "./stack.js";
import { Storage } from "./storage.js";

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
            origin: transaction.origin,
            callData: hexToBytes(transaction.data),
            callValue: transaction.value,
            evm: evm,
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
        return this.context.returnData.length;
    }

    /**
     * @returns Uint8Array
     */
    getReturnData() {
        return this.context.returnData;
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

    // 当用户A通过合约B来call合约C的时候，执行的是合约C的函数，
    // 语境(Context，可以理解为包含变量和状态的环境)也是合约C的：msg.sender是B的地址，并且如果函数改变一些状态变量，产生的效果会作用于合约C的变量上。
    call(value, calldata, address) {
        let tx = {
            nonce: 1,
            from: this.context.to,
            to: address,
            data: bytesToHex(calldata),
            value: value,
            codebyte: this.context.evm.state[address].code
        }

        this._call(tx);
        return 0;
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
            codebyte: this.context.evm.state[address].code
        }

        this._call(tx);
        return 0;
    }

    staticCall(value, calldata, address) {
        let tx = {
            nonce: 1,
            from: this.context.to,
            to: address,
            data: bytesToHex(calldata),
            value: value,
            codebyte: this.context.evm.state[address].code
        }

        this._call(tx);
        return 0;
    }

    _call(tx) {
        this.context.evm.state[tx.from].nonce += 1;
        let interpreter = new Interpreter(tx, this.context.evm);
        const returnData = interpreter.run();
        this.context.returnData = returnData;
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
            if (error.message === 'STOP') {
                console.log('STOP');
            } else {
                console.log(error);
            }
        }

        return this.context.returnData;
    }
}