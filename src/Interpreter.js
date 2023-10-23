import { opCodeFunctionMap } from "./instructions";
import { Memory } from "./memory";
import { Stack } from "./stack";

//  解释器
export class Interpreter {
    constructor(hex) {
        this.context = {
            programCounter: 0,
            bytecode: hexToBytes(data),
            memory: new Memory(),
            stack: new Stack(),

        }
    }

    getCodeSize() {
        return this.context.bytecode.length;
    }

    getCode() {
        return this.context.bytecode;
    }

    getCallValue() {
        return 0;
    }

    run() {
        while (this.programCounter < this.context.bytecode.length) {
            const pc = this.programCounter;
            const opCode = this.context.bytecode[pc];

            console.log(typeof opCode);

            const opFunc = opCodeFunctionMap.get(opCode);

            // 如果为PUSH指令
            if (pc >= 0x5f && pc <= 0x7f) {
                const jumpNum = raw[pc] - 0x5f;
                this.programCounter += jumpNum;
            }

            opFunc(this.context);
        }
    }
}