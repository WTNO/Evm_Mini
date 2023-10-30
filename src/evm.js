import { Interpreter } from "./Interpreter.js";
import { hexToBytes, bytesToHex } from "./bytes.js";
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { Storage } from "./storage.js";
import { RLP } from "@ethereumjs/rlp";

const WORLD_STATE = { "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5": { nonce: 1, balance: 1000000n, code: null } };
const WORLD_STORAGE = new Storage();

const EVM = {
    state: WORLD_STATE,
    storage: WORLD_STORAGE,
    run: function (transaction) {
        transaction.codebyte = transaction.to == null ? hexToBytes(transaction.data) : this.state[transaction.to].code;

        let interpreter;
        if (transaction.to === null) {
            // 计算合约地址
            const fromBytes = hexToBytes(transaction.from);
            const nonceBytes = new Uint8Array([transaction.nonce]);
            const hashBytes = RLP.encode(new Uint8Array(...fromBytes, ...nonceBytes));
            const hash = keccak256(hashBytes);
            var contractAddress = '0x' + bytesToHex(hash).substring(26);

            transaction.to = contractAddress;

            interpreter = new Interpreter(transaction, this)

            const returnData = interpreter.run();

            // 初始化世界状态
            WORLD_STATE[contractAddress] = {
                nonce: 1,
                balance: 0,
                code: returnData
            }

            WORLD_STATE[transaction.from].nonce += 1

            WORLD_STORAGE.put(contractAddress);

            console.log("new contract created : " + contractAddress);
        } else {
            WORLD_STATE[transaction.from].nonce += 1

            interpreter = new Interpreter(transaction, this)
            const returnData = interpreter.run();
        }

        console.log('returnData:', interpreter.context.returnData);
        console.log("world state:", WORLD_STATE);
        console.log("world storage:", WORLD_STORAGE);
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
 * // SPDX-License-Identifier: MIT
 *  pragma solidity ^0.8.0;
 *  
 *  contract StorageLayout {
 *      bytes1 private valByte;
 *      uint256 private valUint256a;
 *      uint32 private valUint32;
 *      uint64 private valUint64;
 *      address private valAddress;
 *      uint256 private valUint256b;
 *  
 *      function set() external {
 *          valByte = 0x10;
 *          valUint256a = 0x11;
 *          valUint32 = 0x12;
 *          valUint64 = 0x13;
 *          valAddress = address(0x14);
 *          valUint256b = 0x15;
 *      }
 *  }
 */

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


