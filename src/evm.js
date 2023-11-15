import { Interpreter } from "./Interpreter.js";
import { hexToBytes, bytesToHex, bigintToBytes, bytesToBigInt } from "./bytes.js";
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
            const nonceBytes = bigintToBytes(BigInt(transaction.nonce));
            const hashBytes = RLP.encode(new Uint8Array([...fromBytes, ...nonceBytes]));
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
    },
    getCode: function(address) {
        return WORLD_STATE[address].code;
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
*/

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
    nonce: 2,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: "0x6621ccb95334f3ec1f8b6787d2569ea14c98b5e5",
    data: "0x3ca065bb00000000000000000000000023983b78d50a8e652cd0ff1e109ef39ff6596111000000000000000000000000000000000000000000000000000000000000007b",
    value: 0n
}

EVM.run(callDeploy);
EVM.run(otherDeploy);
EVM.run(callTx);

