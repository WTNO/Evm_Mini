import { Interpreter } from "./Interpreter.js";
import { hexToBytes, bytesToHex, bigintToBytes, bytesToBigInt } from "./bytes.js";
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { Storage } from "./storage.js";
import { RLP } from "@ethereumjs/rlp";

const WORLD_STATE = { "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5": { nonce: 1, balance: 1000000n, code: null } };
const WORLD_STORAGE = new Storage();

const DEBUG_ALL = 0xff;
const DEBUG_OFF = 0x00;
const DEBUG_STACK = 0x01;
const DEBUG_MEMORY = 0x02;

const EVM = {
    state: WORLD_STATE,
    storage: WORLD_STORAGE,
    run: function (transaction) {
        transaction.codebyte = transaction.to == null ? hexToBytes(transaction.data) : this.state[transaction.to].code;

        let interpreter;
        if (transaction.to === null) {
            // 计算合约地址
            const fromBytes = hexToBytes(transaction.from);
            const nonceBytes = bigintToBytes(BigInt(transaction.nonce));
            const hashBytes = RLP.encode(new Uint8Array([...fromBytes, ...nonceBytes]));
            const hash = keccak256(hashBytes);
            var contractAddress = '0x' + bytesToHex(hash).substring(26);

            transaction.to = contractAddress;

            interpreter = new Interpreter(transaction, this);

            this.currentInterpreter = interpreter;

            const returnData = interpreter.run();

            // 初始化世界状态
            WORLD_STATE[contractAddress] = {
                nonce: 1,
                balance: 0,
                code: returnData
            }

            WORLD_STATE[transaction.from].nonce += 1;

            WORLD_STORAGE.put(contractAddress);

            console.log("new contract created : " + contractAddress);
        } else {
            WORLD_STATE[transaction.from].nonce += 1;

            interpreter = new Interpreter(transaction, this);

            this.currentInterpreter = interpreter;

            const returnData = interpreter.run();
        }

        console.log('returnData:', bytesToHex(interpreter.context.returnData));
        console.log("world state:", WORLD_STATE);
        console.log("world storage:", WORLD_STORAGE);
        console.log("--------------------------------------------------------------------------------------------");
    },
    getCode: function (address) {
        return WORLD_STATE[address].code;
    },
    step: function (debug = DEBUG_OFF) {
        if (this.currentInterpreter.context.status !== "running" && this.currentInterpreter.context.status !== "paused")
            return { status: -1, message: "no program running" };

        this.debug = debug;

        const pc = this.currentInterpreter.context.programCounter;
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

        if ((this.debug & DEBUG_STACK) === DEBUG_STACK) console.log("stack info: \n" + this.stackInfo());
        if ((this.debug & DEBUG_MEMORY) === DEBUG_MEMORY) console.log("memory info: \n" + bytesToHex(this.currentInterpreter.context.memory._store));

        return opFunc(this.currentInterpreter.context);
    },

    forward: function (debug = DEBUG_OFF, breakpoint = -1) {
        if (this.currentInterpreter.context.status !== "running" && this.currentInterpreter.context.status !== "paused")
            return { status: -1, message: "no program running" };

        this.debug = debug;

        if (this.currentInterpreter.context.status === "paused")
            this.currentInterpreter.context.status = "running";

        var result = { status: 0, message: "" };

        while (result.status === 0) {
            if (this.debug > 0 && this.currentInterpreter.context.programCounter === breakpoint) {
                this.status = "paused";
                console.log("break point: " + breakpoint, EVM);
                if ((this.debug & DEBUG_STACK) === DEBUG_STACK) console.log("stack info: \n" + this.stackInfo());
                if ((this.debug & DEBUG_MEMORY) === DEBUG_MEMORY) console.log("memory info: \n" + bytesToHex(this.currentInterpreter.context.memory._store));
                return { status: -1, message: "paused" };
            }

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

            // TODO
            result = opFunc(this.currentInterpreter.context);
        }

        if (result.status === 1) {
            if (this.tx.to === null) {
                this.state[this.address] = {
                    nonce: 1,
                    balance: 0,
                    code: result.bytes,
                    storage: {}
                }
                this.state[this.tx.origin].nonce += 1
            }
        }

        this.status = "idle";

        return result;
    },

    stackInfo: function () {
        return Array.from(this.currentInterpreter.context.stack._store).reverse().reduce((str, value) => (str += bytesToHex(bigintToBytes(value)) + "\n"), "");
    }
}

/*  测试用例
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.0;

    contract Simple {
        uint256 public val1;
        uint256 public val2;

        constructor() {
            val2 = 3;
        }

        function set(uint256 _param) external {
            val1 = _param;
        }

        fallback() external payable {}
    }
*/

/*
var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    // data: "0x608060405234801561000f575f80fd5b50600360018190555061016f806100255f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c806360fe47b11461004357806395cacbe01461005f578063c82fdf361461007d575b5f80fd5b61005d600480360381019061005891906100e6565b61009b565b005b6100676100a4565b6040516100749190610120565b60405180910390f35b6100856100aa565b6040516100929190610120565b60405180910390f35b805f8190555050565b60015481565b5f5481565b5f80fd5b5f819050919050565b6100c5816100b3565b81146100cf575f80fd5b50565b5f813590506100e0816100bc565b92915050565b5f602082840312156100fb576100fa6100af565b5b5f610108848285016100d2565b91505092915050565b61011a816100b3565b82525050565b5f6020820190506101335f830184610111565b9291505056fea264697066735822122005c408db9d51b7388bee0e40bd0d42dfa065917597528e34f06f8d43578a302c64736f6c63430008150033",
    data: "0x608060405234801561000f575f80fd5b50600360018190555061018a806100255f395ff3fe608060405260043610610037575f3560e01c806360fe47b11461003a57806395cacbe014610062578063c82fdf361461008c57610038565b5b005b348015610045575f80fd5b50610060600480360381019061005b9190610101565b6100b6565b005b34801561006d575f80fd5b506100766100bf565b604051610083919061013b565b60405180910390f35b348015610097575f80fd5b506100a06100c5565b6040516100ad919061013b565b60405180910390f35b805f8190555050565b60015481565b5f5481565b5f80fd5b5f819050919050565b6100e0816100ce565b81146100ea575f80fd5b50565b5f813590506100fb816100d7565b92915050565b5f60208284031215610116576101156100ca565b5b5f610123848285016100ed565b91505092915050565b610135816100ce565b82525050565b5f60208201905061014e5f83018461012c565b9291505056fea26469706673582212203a365fa55e529a903c5fbdecfde628f40c6de7ed8225391318b8c9b58a99099364736f6c63430008150033",
    value: 0n
}

var setTransaction = {
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0x60fe47b1000000000000000000000000000000000000000000000000000000000000000c",
    value: 0n
}

var getVal1Transaction = {
    nonce: 3,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0xc82fdf36",
    value: 0n
}

var getVal2Transaction = {
    nonce: 4,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0x95cacbe0",
    value: 0n
}

var fallbackTransaction = {
    nonce: 5,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0x",
    value: 100n
}

console.log("\n部署合约，初始化 val2 = 3\n")

EVM.run(transaction);

console.log("\n调用set方法，设置 val1 = 12 \n")

EVM.run(setTransaction);

console.log("\n调用get方法，获取val1的值 \n")

EVM.run(getVal1Transaction);

console.log("\n调用get方法，获取val2的值 \n")

EVM.run(getVal2Transaction);

// 貌似转账功能不是通过指令实现
// 加入fallback函数以后，如果交易数据字段的前4字节与任何函数选择器都不匹配，则程序计数器会跳转到55这里(在这个示例中)。
// 这是后备函数：这个函数是空的，所以接下来是STOP。STOP：表示交易执行成功。
// 现在，每个函数都需要检查交易值字段，除非该函数不可支付。
// console.log("\n转账，触发fallback \n")
EVM.run(fallbackTransaction);
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageLayout {
    bytes1 private valByte;
    uint256 private valUint256a;
    uint32 private valUint32;
    uint64 private valUint64;
    address private valAddress;
    uint256 private valUint256b;

    function set() external {
        valByte = 0x10;
        valUint256a = 0x11;
        valUint32 = 0x12;
        valUint64 = 0x13;
        valAddress = address(0x14);
        valUint256b = 0x15;
    }
}


var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x6080604052348015600e575f80fd5b506101248061001c5f395ff3fe6080604052348015600e575f80fd5b50600436106026575f3560e01c8063b8e010de14602a575b5f80fd5b60306032565b005b601060f81b5f806101000a81548160ff021916908360f81c02179055506011600181905550601260025f6101000a81548163ffffffff021916908363ffffffff1602179055506013600260046101000a81548167ffffffffffffffff021916908367ffffffffffffffff16021790555060146002600c6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550601560038190555056fea26469706673582212209a7be6580c5bc887f5caa4a9e37e356cf0e860f951fe1414d3c1820c610069be64736f6c63430008150033",
    value: 0n
}

var setTransaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0xb8e010de",
    value: 0n
}

EVM.run(transaction);

EVM.run(setTransaction);

console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", 0n))))
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", 1n))))
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", 2n))))
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", 3n))))
*/

/*

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageBytes {
    bytes private valBytes;

    function setBytes(bytes1 _val) external {
        valBytes.push(_val);
    }
}



var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506101fe8061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c8063e4e38de31461002d575b5f80fd5b61004760048036038101906100429190610140565b610049565b005b5f81908080548061005990610198565b80601f810361007657835f5260205f2060ff1984168155603f9350505b506002820183556001810192505050600190038154600116156100a657905f5260205f2090602091828204019190065b909190919091601f036101000a81548160ff021916907f01000000000000000000000000000000000000000000000000000000000000008404021790555050565b5f80fd5b5f7fff0000000000000000000000000000000000000000000000000000000000000082169050919050565b61011f816100eb565b8114610129575f80fd5b50565b5f8135905061013a81610116565b92915050565b5f60208284031215610155576101546100e7565b5b5f6101628482850161012c565b91505092915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f60028204905060018216806101af57607f821691505b6020821081036101c2576101c161016b565b5b5091905056fea2646970667358221220a616bf1f7007e859f42bf6eba22f265ddfc8019403a222db93c165dfc70a760164736f6c63430008150033",
    value: 0n
}

var setBytesTransaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0xe4e38de3aa00000000000000000000000000000000000000000000000000000000000000",
    value: 0n
}

EVM.run(transaction);

// 当字节数超过31字节，slot存储的是长度 + 标志位1，数据位置在keccak256(slot)、keccak256(slot) + 1
for (let index = 0; index < 34; index++) {
    EVM.run(setBytesTransaction);
    console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", 0n))));
}
var a = bytesToBigInt(keccak256(new Uint8Array(32)));
var b = bytesToBigInt(keccak256(new Uint8Array(32))) + 1n;
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", a))));
console.log(bytesToHex(bigintToBytes(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", b))));
*/

/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageArrays {
    uint256[] private arrayUint256;
    bytes1[] private arrayByte;

    function setUint256ArrayVal(uint256 _ofs, uint256 _val) external {
        arrayUint256[_ofs] = _val;
    }

    function setByteArrayVal(uint256 _ofs, bytes1 _val) external {
        arrayByte[_ofs] = _val;
    }
}


// 动态数组的值存储在以下位置：storage[keccak256(slot)+key] = value
// 动态数组中的元素数量存储在 storage[slot]
var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102408061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c8063778b589214610038578063da1e128e14610054575b5f80fd5b610052600480360381019061004d9190610161565b610070565b005b61006e6004803603810190610069919061019f565b6100b1565b005b8060018381548110610085576100846101dd565b5b905f5260205f2090602091828204019190066101000a81548160ff021916908360f81c02179055505050565b805f83815481106100c5576100c46101dd565b5b905f5260205f2001819055505050565b5f80fd5b5f819050919050565b6100eb816100d9565b81146100f5575f80fd5b50565b5f81359050610106816100e2565b92915050565b5f7fff0000000000000000000000000000000000000000000000000000000000000082169050919050565b6101408161010c565b811461014a575f80fd5b50565b5f8135905061015b81610137565b92915050565b5f8060408385031215610177576101766100d5565b5b5f610184858286016100f8565b92505060206101958582860161014d565b9150509250929050565b5f80604083850312156101b5576101b46100d5565b5b5f6101c2858286016100f8565b92505060206101d3858286016100f8565b9150509250929050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffdfea2646970667358221220ae9c32aa4eae98b29d153af4f79d9a1434944e58fb1828d207fdc0afd58d3d1e64736f6c63430008150033",
    value: 0n
}

var setUint256ArrayValTx = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0xda1e128e000000000000000000000000000000000000000000000000000000000000006f0000000000000000000000000000000000000000000000000000000000002af8",
    value: 0n
}

var setByteArrayValTx = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0x778b589200000000000000000000000000000000000000000000000000000000000003e8e100000000000000000000000000000000000000000000000000000000000000",
    value: 0n
}

EVM.run(transaction);
EVM.run(setUint256ArrayValTx);
EVM.run(setByteArrayValTx);
*/

/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageMappings {
    mapping(uint256 => uint256) private map;

    function setMapVal(uint256 _key, uint256 _val) external {
        map[_key] = _val;
    }
}


var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561001057600080fd5b506101c2806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80634dcb6e681461003b578063b8dda9c714610057575b600080fd5b610055600480360381019061005091906100f5565b610087565b005b610071600480360381019061006c9190610135565b6100a2565b60405161007e9190610171565b60405180910390f35b80600080848152602001908152602001600020819055505050565b60006020528060005260406000206000915090505481565b600080fd5b6000819050919050565b6100d2816100bf565b81146100dd57600080fd5b50565b6000813590506100ef816100c9565b92915050565b6000806040838503121561010c5761010b6100ba565b5b600061011a858286016100e0565b925050602061012b858286016100e0565b9150509250929050565b60006020828403121561014b5761014a6100ba565b5b6000610159848285016100e0565b91505092915050565b61016b816100bf565b82525050565b60006020820190506101866000830184610162565b9291505056fea264697066735822122037246619b06bbf96fe04f910e0ba91be3d66e85b5609d6d88932ee264c025c3964736f6c63430008090033",
    value: 0n
}

var setMapValTx = {
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0x4dcb6e68000000000000000000000000000000000000000000000000000000000000006f0000000000000000000000000000000000000000000000000000000000002af8",// 111:11000
    value: 0n
}

var getMapValTx = {
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xe412d2cb0138712d98899fa070f976b14103b4a1",
    data: "0xb8dda9c7000000000000000000000000000000000000000000000000000000000000006f",// 111
    value: 0n
}

EVM.run(transaction);
EVM.run(setMapValTx);
EVM.run(getMapValTx);

// Mappings的存储
// storage[keccak256(key . storage slot number)] = value
const arr = new Uint8Array(64);
arr[31] = 111;
console.log(WORLD_STORAGE.get("0xe412d2cb0138712d98899fa070f976b14103b4a1", bytesToBigInt(keccak256(arr))));
*/

/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CallContract {
    function callSetX(address _addr, uint256 x) public {
        // call setX()
        (bool success, bytes memory data) = _addr.call(abi.encodeWithSignature("setX(uint256)", x));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OtherContract {
    uint256 private _x = 0; // 状态变量x
    
    // 可以调整状态变量_x的函数
    function setX(uint256 x) external {
        _x = x;
    }

    // 读取x
    function getX() external view returns(uint x){
        x = _x;
    }
}


var callDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102f58061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c80633ca065bb1461002d575b5f80fd5b610047600480360381019061004291906101d7565b610049565b005b5f808373ffffffffffffffffffffffffffffffffffffffff16836040516024016100739190610224565b6040516020818303038152906040527f4018d9aa000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516100fd91906102a9565b5f604051808303815f865af19150503d805f8114610136576040519150601f19603f3d011682016040523d82523d5f602084013e61013b565b606091505b509150915050505050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6101738261014a565b9050919050565b61018381610169565b811461018d575f80fd5b50565b5f8135905061019e8161017a565b92915050565b5f819050919050565b6101b6816101a4565b81146101c0575f80fd5b50565b5f813590506101d1816101ad565b92915050565b5f80604083850312156101ed576101ec610146565b5b5f6101fa85828601610190565b925050602061020b858286016101c3565b9150509250929050565b61021e816101a4565b82525050565b5f6020820190506102375f830184610215565b92915050565b5f81519050919050565b5f81905092915050565b5f5b8381101561026e578082015181840152602081019050610253565b5f8484015250505050565b5f6102838261023d565b61028d8185610247565b935061029d818560208601610251565b80840191505092915050565b5f6102b48284610279565b91508190509291505056fea26469706673582212201ab248bd04b88fb539ca092e6345a11ebea8295cec99d55a379cd59e4dbd279564736f6c63430008150033",
    value: 0n
}

var otherDeploy = {
    nonce: 10001,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x60806040525f8055348015610012575f80fd5b50610143806100205f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80634018d9aa146100385780635197c7aa14610054575b5f80fd5b610052600480360381019061004d91906100ba565b610072565b005b61005c61007b565b60405161006991906100f4565b60405180910390f35b805f8190555050565b5f8054905090565b5f80fd5b5f819050919050565b61009981610087565b81146100a3575f80fd5b50565b5f813590506100b481610090565b92915050565b5f602082840312156100cf576100ce610083565b5b5f6100dc848285016100a6565b91505092915050565b6100ee81610087565b82525050565b5f6020820190506101075f8301846100e5565b9291505056fea26469706673582212200da2d2b22b4f06459529e26a849eac17f2c0a610f4f13d6665bf5c708df0f18a64736f6c63430008150033",
    value: 0n
}

var callTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x3ca065bb00000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007c",
    value: 0n
}

var getTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x23983b78d50a8e652cd0ff1e109ef39ff6596111",
    data: "0x5197c7aa",
    value: 0n
}

EVM.run(callDeploy);
EVM.run(otherDeploy);
EVM.run(callTx);
EVM.run(getTx);
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract C {
    uint public num;
    address public sender;

    function setVars(uint _num) public payable {
        num = _num;
        sender = msg.sender;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract B {
    uint public num;
    address public sender;

    // 通过call来调用C的setVars()函数，将改变合约C里的状态变量
    function callSetVars(address _addr, uint _num) external payable{
        // call setVars()
        (bool success, bytes memory data) = _addr.call(
            abi.encodeWithSignature("setVars(uint256)", _num)
        );
    }

    // 通过delegatecall来调用C的setVars()函数，将改变合约B里的状态变量
    function delegatecallSetVars(address _addr, uint _num) external payable{
        // delegatecall setVars()
        (bool success, bytes memory data) = _addr.delegatecall(
            abi.encodeWithSignature("setVars(uint256)", _num)
        );
    }
}


var BDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506104bc8061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80631c1cba571461004e5780634e70b1dc1461006a57806367e404ce14610088578063b39a9641146100a6575b5f80fd5b61006860048036038101906100639190610376565b6100c2565b005b6100726101be565b60405161007f91906103c3565b60405180910390f35b6100906101c3565b60405161009d91906103eb565b60405180910390f35b6100c060048036038101906100bb9190610376565b6101e8565b005b5f808373ffffffffffffffffffffffffffffffffffffffff16836040516024016100ec91906103c3565b6040516020818303038152906040527f6466414b000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516101769190610470565b5f60405180830381855af49150503d805f81146101ae576040519150601f19603f3d011682016040523d82523d5f602084013e6101b3565b606091505b509150915050505050565b5f5481565b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f808373ffffffffffffffffffffffffffffffffffffffff168360405160240161021291906103c3565b6040516020818303038152906040527f6466414b000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff838183161783525050505060405161029c9190610470565b5f604051808303815f865af19150503d805f81146102d5576040519150601f19603f3d011682016040523d82523d5f602084013e6102da565b606091505b509150915050505050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610312826102e9565b9050919050565b61032281610308565b811461032c575f80fd5b50565b5f8135905061033d81610319565b92915050565b5f819050919050565b61035581610343565b811461035f575f80fd5b50565b5f813590506103708161034c565b92915050565b5f806040838503121561038c5761038b6102e5565b5b5f6103998582860161032f565b92505060206103aa85828601610362565b9150509250929050565b6103bd81610343565b82525050565b5f6020820190506103d65f8301846103b4565b92915050565b6103e581610308565b82525050565b5f6020820190506103fe5f8301846103dc565b92915050565b5f81519050919050565b5f81905092915050565b5f5b8381101561043557808201518184015260208101905061041a565b5f8484015250505050565b5f61044a82610404565b610454818561040e565b9350610464818560208601610418565b80840191505092915050565b5f61047b8284610440565b91508190509291505056fea264697066735822122015c4d211d019fe776b614a588b2b8676a34f86b0417adfc60ab316b8bcd3c67664736f6c63430008150033",
    value: 0n
}

var CDeploy = {
    nonce: 10001,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102268061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80634e70b1dc146100435780636466414b1461006157806367e404ce1461007d575b5f80fd5b61004b61009b565b6040516100589190610126565b60405180910390f35b61007b6004803603810190610076919061016d565b6100a0565b005b6100856100e9565b60405161009291906101d7565b60405180910390f35b5f5481565b805f819055503360015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f819050919050565b6101208161010e565b82525050565b5f6020820190506101395f830184610117565b92915050565b5f80fd5b61014c8161010e565b8114610156575f80fd5b50565b5f8135905061016781610143565b92915050565b5f602082840312156101825761018161013f565b5b5f61018f84828501610159565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6101c182610198565b9050919050565b6101d1816101b7565b82525050565b5f6020820190506101ea5f8301846101c8565b9291505056fea2646970667358221220c8fc00a70cf7aa5222da968ffa0d664d764cfc9876839cd9fede5788d3931c4664736f6c63430008150033",
    value: 0n
}

var delegatecallTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x1c1cba5700000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007b",
    value: 0n
}

var getBNumTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x4e70b1dc",
    value: 0n
}

var getBSenderTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x67e404ce",
    value: 0n
}

var getCNumTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x23983b78d50a8e652cd0ff1e109ef39ff6596111",
    data: "0x4e70b1dc",
    value: 0n
}

var getCSenderTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x23983b78d50a8e652cd0ff1e109ef39ff6596111",
    data: "0x67e404ce",
    value: 0n
}

EVM.run(BDeploy);
EVM.run(CDeploy);
EVM.run(delegatecallTx);
EVM.run(getBNumTx);
EVM.run(getBSenderTx);
EVM.run(getCNumTx);
EVM.run(getCSenderTx);
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Pair{
    address public factory; // 工厂合约地址
    address public token0; // 代币1
    address public token1; // 代币2

    constructor() payable {
        factory = msg.sender;
    }

    // called once by the factory at time of deployment
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, 'UniswapV2: FORBIDDEN'); // sufficient check
        token0 = _token0;
        token1 = _token1;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Pair.sol";

contract PairFactory{
    mapping(address => mapping(address => address)) public getPair; // 通过两个代币地址查Pair地址
    address[] public allPairs; // 保存所有Pair地址

    function createPair(address tokenA, address tokenB) external returns (address pairAddr) {
        // 创建新合约
        Pair pair = new Pair(); 
        // 调用新合约的initialize方法
        pair.initialize(tokenA, tokenB);
        // 更新地址map
        pairAddr = address(pair);
        allPairs.push(pairAddr);
        getPair[tokenA][tokenB] = pairAddr;
        getPair[tokenB][tokenA] = pairAddr;
    }
}


var factoryDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506109408061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80631e3dd18b14610043578063c9c6539614610073578063e6a43905146100a3575b5f80fd5b61005d600480360381019061005891906103f4565b6100d3565b60405161006a919061045e565b60405180910390f35b61008d600480360381019061008891906104a1565b61010e565b60405161009a919061045e565b60405180910390f35b6100bd60048036038101906100b891906104a1565b610374565b6040516100ca919061045e565b60405180910390f35b600181815481106100e2575f80fd5b905f5260205f20015f915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8060405161011c906103b0565b604051809103905ff080158015610135573d5f803e3d5ffd5b5090508073ffffffffffffffffffffffffffffffffffffffff1663485cc95585856040518363ffffffff1660e01b81526004016101739291906104df565b5f604051808303815f87803b15801561018a575f80fd5b505af115801561019c573d5f803e3d5ffd5b50505050809150600182908060018154018082558091505060019003905f5260205f20015f9091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550815f808673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550815f808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505092915050565b5f602052815f5260405f20602052805f5260405f205f915091509054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6104048061050783390190565b5f80fd5b5f819050919050565b6103d3816103c1565b81146103dd575f80fd5b50565b5f813590506103ee816103ca565b92915050565b5f60208284031215610409576104086103bd565b5b5f610416848285016103e0565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6104488261041f565b9050919050565b6104588161043e565b82525050565b5f6020820190506104715f83018461044f565b92915050565b6104808161043e565b811461048a575f80fd5b50565b5f8135905061049b81610477565b92915050565b5f80604083850312156104b7576104b66103bd565b5b5f6104c48582860161048d565b92505060206104d58582860161048d565b9150509250929050565b5f6040820190506104f25f83018561044f565b6104ff602083018461044f565b939250505056fe6080604052335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506103b4806100505f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80630dfe16811461004e578063485cc9551461006c578063c45a015514610088578063d21220a7146100a6575b5f80fd5b6100566100c4565b6040516100639190610281565b60405180910390f35b610086600480360381019061008191906102c8565b6100e9565b005b6100906101fa565b60405161009d9190610281565b60405180910390f35b6100ae61021d565b6040516100bb9190610281565b60405180910390f35b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610176576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161016d90610360565b60405180910390fd5b8160015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508060025f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60025f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61026b82610242565b9050919050565b61027b81610261565b82525050565b5f6020820190506102945f830184610272565b92915050565b5f80fd5b6102a781610261565b81146102b1575f80fd5b50565b5f813590506102c28161029e565b92915050565b5f80604083850312156102de576102dd61029a565b5b5f6102eb858286016102b4565b92505060206102fc858286016102b4565b9150509250929050565b5f82825260208201905092915050565b7f556e697377617056323a20464f5242494444454e0000000000000000000000005f82015250565b5f61034a601483610306565b915061035582610316565b602082019050919050565b5f6020820190508181035f8301526103778161033e565b905091905056fea26469706673582212207a956edd919e963b557828a9510257a37cd5959d60fb5473f124d0de1e79204564736f6c63430008150033a2646970667358221220fc76891a60f231ff0b99cb785892b85919314834a6def28b468fa0d13af31c5e64736f6c63430008150033",
    value: 0n
}

// createPair(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var createPairTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0xc9c65396000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

// getPair(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var getPairTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0xe6a43905000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

var getToken0Tx = {
    nonce: 10004,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x4f9cf3addeb9bb5be1dc5181c3644ee28801c922",
    data: "0x0dfe1681",
    value: 0n
}

var getToken1Tx = {
    nonce: 10005,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x4f9cf3addeb9bb5be1dc5181c3644ee28801c922",
    data: "0xd21220a7",
    value: 0n
}

EVM.run(factoryDeploy);
EVM.run(createPairTx);
EVM.run(getPairTx);
EVM.run(getToken0Tx);
EVM.run(getToken1Tx);
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Pair.sol";

contract PairFactory2 {
    mapping(address => mapping(address => address)) public getPair; // 通过两个代币地址查Pair地址
    address[] public allPairs; // 保存所有Pair地址

    function createPair2(address tokenA, address tokenB)
        external
        returns (address pairAddr)
    {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES"); //避免tokenA和tokenB相同产生的冲突
        // 计算用tokenA和tokenB地址计算salt
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA); //将tokenA和tokenB按大小排序
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        // 用create2部署新合约
        Pair pair = new Pair{salt: salt}();
        // 调用新合约的initialize方法
        pair.initialize(tokenA, tokenB);
        // 更新地址map
        pairAddr = address(pair);
        allPairs.push(pairAddr);
        getPair[tokenA][tokenB] = pairAddr;
        getPair[tokenB][tokenA] = pairAddr;
    }
}


var factoryDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b50610b0d8061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80631e3dd18b146100435780639385018714610073578063e6a43905146100a3575b5f80fd5b61005d600480360381019061005891906104d9565b6100d3565b60405161006a9190610543565b60405180910390f35b61008d60048036038101906100889190610586565b61010e565b60405161009a9190610543565b60405180910390f35b6100bd60048036038101906100b89190610586565b610459565b6040516100ca9190610543565b60405180910390f35b600181815481106100e2575f80fd5b905f5260205f20015f915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff160361017d576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016101749061061e565b60405180910390fd5b5f808373ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff16106101b95783856101bc565b84845b915091505f82826040516020016101d4929190610681565b6040516020818303038152906040528051906020012090505f816040516101fa90610495565b8190604051809103905ff5905080158015610217573d5f803e3d5ffd5b5090508073ffffffffffffffffffffffffffffffffffffffff1663485cc95588886040518363ffffffff1660e01b81526004016102559291906106ac565b5f604051808303815f87803b15801561026c575f80fd5b505af115801561027e573d5f803e3d5ffd5b50505050809450600185908060018154018082558091505060019003905f5260205f20015f9091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550845f808973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8873ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550845f808873ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050505092915050565b5f602052815f5260405f20602052805f5260405f205f915091509054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b610404806106d483390190565b5f80fd5b5f819050919050565b6104b8816104a6565b81146104c2575f80fd5b50565b5f813590506104d3816104af565b92915050565b5f602082840312156104ee576104ed6104a2565b5b5f6104fb848285016104c5565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61052d82610504565b9050919050565b61053d81610523565b82525050565b5f6020820190506105565f830184610534565b92915050565b61056581610523565b811461056f575f80fd5b50565b5f813590506105808161055c565b92915050565b5f806040838503121561059c5761059b6104a2565b5b5f6105a985828601610572565b92505060206105ba85828601610572565b9150509250929050565b5f82825260208201905092915050565b7f4944454e544943414c5f414444524553534553000000000000000000000000005f82015250565b5f6106086013836105c4565b9150610613826105d4565b602082019050919050565b5f6020820190508181035f830152610635816105fc565b9050919050565b5f8160601b9050919050565b5f6106528261063c565b9050919050565b5f61066382610648565b9050919050565b61067b61067682610523565b610659565b82525050565b5f61068c828561066a565b60148201915061069c828461066a565b6014820191508190509392505050565b5f6040820190506106bf5f830185610534565b6106cc6020830184610534565b939250505056fe6080604052335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506103b4806100505f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80630dfe16811461004e578063485cc9551461006c578063c45a015514610088578063d21220a7146100a6575b5f80fd5b6100566100c4565b6040516100639190610281565b60405180910390f35b610086600480360381019061008191906102c8565b6100e9565b005b6100906101fa565b60405161009d9190610281565b60405180910390f35b6100ae61021d565b6040516100bb9190610281565b60405180910390f35b60015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610176576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161016d90610360565b60405180910390fd5b8160015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508060025f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60025f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61026b82610242565b9050919050565b61027b81610261565b82525050565b5f6020820190506102945f830184610272565b92915050565b5f80fd5b6102a781610261565b81146102b1575f80fd5b50565b5f813590506102c28161029e565b92915050565b5f80604083850312156102de576102dd61029a565b5b5f6102eb858286016102b4565b92505060206102fc858286016102b4565b9150509250929050565b5f82825260208201905092915050565b7f556e697377617056323a20464f5242494444454e0000000000000000000000005f82015250565b5f61034a601483610306565b915061035582610316565b602082019050919050565b5f6020820190508181035f8301526103778161033e565b905091905056fea2646970667358221220ff8d578375d132b6ea9a442465bef2f91c7b7c323cc532909299f545f15e042a64736f6c63430008150033a2646970667358221220ece2f1bc303bcf1d4725cf022d580fbbf096ce9eeb3a2413098a3dfbd1c9bc4464736f6c63430008150033",
    value: 0n
}

// createPair2(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var createPair2Tx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x93850187000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

// getPair(0x617F2E2fD72FD9D5503197092aC168c91465E7f2, 0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678)
var getPairTx = {
    nonce: 10003,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0xe6a43905000000000000000000000000617f2e2fd72fd9d5503197092ac168c91465e7f20000000000000000000000005c6b0f7bf3e7ce046039bd8fabdfd3f9f5021678",
    value: 0n
}

var getToken0Tx = {
    nonce: 10004,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xf94f64a24c77e26e8cda23f48af9bb7f8fb923dc",
    data: "0x0dfe1681",
    value: 0n
}

var getToken1Tx = {
    nonce: 10005,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0xf94f64a24c77e26e8cda23f48af9bb7f8fb923dc",
    data: "0xd21220a7",
    value: 0n
}

EVM.run(factoryDeploy);
EVM.run(createPair2Tx);
EVM.run(getPairTx);
EVM.run(getToken0Tx);
EVM.run(getToken1Tx);
*/

/**
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CallContract {
    function callSetX(address _addr, uint256 x) public {
        // call setX()
        (bool success, bytes memory data) = _addr.staticcall(abi.encodeWithSignature("setX(uint256)", x));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OtherContract {
    uint256 private _x = 0; // 状态变量x
    
    // 可以调整状态变量_x的函数
    function setX(uint256 x) external {
        _x = x;
    }

    // 读取x
    function getX() external view returns(uint x){
        x = _x;
    }
}
*/

var callDeploy = {
    nonce: 10000,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b506102f48061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c80633ca065bb1461002d575b5f80fd5b610047600480360381019061004291906101d6565b610049565b005b5f808373ffffffffffffffffffffffffffffffffffffffff16836040516024016100739190610223565b6040516020818303038152906040527f4018d9aa000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516100fd91906102a8565b5f60405180830381855afa9150503d805f8114610135576040519150601f19603f3d011682016040523d82523d5f602084013e61013a565b606091505b509150915050505050565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61017282610149565b9050919050565b61018281610168565b811461018c575f80fd5b50565b5f8135905061019d81610179565b92915050565b5f819050919050565b6101b5816101a3565b81146101bf575f80fd5b50565b5f813590506101d0816101ac565b92915050565b5f80604083850312156101ec576101eb610145565b5b5f6101f98582860161018f565b925050602061020a858286016101c2565b9150509250929050565b61021d816101a3565b82525050565b5f6020820190506102365f830184610214565b92915050565b5f81519050919050565b5f81905092915050565b5f5b8381101561026d578082015181840152602081019050610252565b5f8484015250505050565b5f6102828261023c565b61028c8185610246565b935061029c818560208601610250565b80840191505092915050565b5f6102b38284610278565b91508190509291505056fea2646970667358221220e6073d99e8cbc7b17313b034d5c1b908023cc921495c9ce75acbd52eebc464c664736f6c63430008150033",
    value: 0n
}

var otherDeploy = {
    nonce: 10001,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x60806040525f8055348015610012575f80fd5b50610143806100205f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80634018d9aa146100385780635197c7aa14610054575b5f80fd5b610052600480360381019061004d91906100ba565b610072565b005b61005c61007b565b60405161006991906100f4565b60405180910390f35b805f8190555050565b5f8054905090565b5f80fd5b5f819050919050565b61009981610087565b81146100a3575f80fd5b50565b5f813590506100b481610090565b92915050565b5f602082840312156100cf576100ce610083565b5b5f6100dc848285016100a6565b91505092915050565b6100ee81610087565b82525050565b5f6020820190506101075f8301846100e5565b9291505056fea26469706673582212200da2d2b22b4f06459529e26a849eac17f2c0a610f4f13d6665bf5c708df0f18a64736f6c63430008150033",
    value: 0n
}

var callTx = {
    nonce: 10002,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x3ca065bb00000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007c",
    value: 0n
}

EVM.run(callDeploy);
EVM.run(otherDeploy);
EVM.run(callTx);