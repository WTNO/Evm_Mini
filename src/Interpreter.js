import { hexToBytes } from "./bytes.js";
import { opCodeFunctionMap } from "./instructions.js";
import { Memory } from "./memory.js";
import { Stack } from "./stack.js";
import { Storage } from "./storage.js";

//  解释器
export class Interpreter {
    constructor(hex) {
        this.context = {
            programCounter: 0,
            codebyte: hexToBytes(hex),
            memory: new Memory(),
            stack: new Stack(),
            opCode: 0xfe,
            interpreter: this,
            storage: new Storage(),
        }
    }

    getCodeSize() {
        return this.context.codebyte.length;
    }

    getCode() {
        return this.context.codebyte;
    }

    getCallValue() {
        return 0n;
    }

    run() {
        while (this.context.programCounter < this.context.codebyte.length) {
            const pc = this.context.programCounter;
            const opCode = this.context.codebyte[pc];
            this.context.opCode = opCode;

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

            console.log('stack:', this.context.stack._store);
            console.log('memory:', this.context.memory._store);
            console.log('returnData:', this.context.returnData);
            console.log('-----------------------------------------------------')
        }
    }
}