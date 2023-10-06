import { TWO_POW256 } from "./constants";
import { mod } from "./utils";

// 指令集

export const opCodeFunctionMap = new Map([
    // STOP
    [
        0x00,
        function() {
            throw new Error('STOP INSTRUCTION');
        }
    ],
    // ADD
    [
        0x01,
        function(context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a + b, TWO_POW256))
        }
    ],
    // MUL
    [
        0x02,
        function(context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a * b, TWO_POW256))
        }
    ],
    // SUB
    [
        0x03,
        function(context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a - b, TWO_POW256))
        }
    ],
    // DIV
    [
        0x04,
        function(context) {
            const a = context.stack.pop();
            const b = context.stack.pop();
            context.stack.push(mod(a / b, TWO_POW256))
        }
    ],
])