import { hexToBytes } from "./bytes.js";
import { opCodeFunctionMap } from "./instructions.js";
import { Memory } from "./memory.js";
import { Stack } from "./stack.js";

//  解释器
export class Interpreter {
    constructor(hex) {
        this.context = {
            programCounter: 0,
            codebyte: hexToBytes(hex),
            memory: new Memory(),
            stack: new Stack(),
            opCode: 0xfe,
        }
    }

    getCodeSize() {
        return this.context.codebyte.length;
    }

    getCode() {
        return this.context.codebyte;
    }

    getCallValue() {
        return 0;
    }

    run() {
        while (this.context.programCounter < this.context.codebyte.length) {
            const pc = this.context.programCounter;
            const opCode = this.context.codebyte[pc];
            this.context.opCode = opCode;

            console.log(typeof opCode);

            const opFunc = opCodeFunctionMap.get(opCode);

            // 如果为PUSH指令
            // if (opCode >= 0x5f && opCode <= 0x7f) {
            //     const jumpNum = opCode - 0x5f;
            //     this.context.programCounter += jumpNum;
            // }
            this.context.programCounter++;

            opFunc(this.context);
        }
    }
}