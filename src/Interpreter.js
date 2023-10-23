import { Memory } from "./memory";
import { Stack } from "./stack";

//  解释器
export class Interpreter {
    constructor(hex) {
        this.bytecode = hexToBytes(data);
        this.context = {
            programCounter: 0,
            memory: new Memory(),
            stack: new Stack(),

        }
    }

    getCodeSize() {
        return this.bytecode.length;
    }

    getCode() {
        return this.bytecode;
    }
    
    getCallValue() {
        return 0;
    }

    run() {
        while (this.programCounter < this.bytecode.length) {
            
        }
    }
}