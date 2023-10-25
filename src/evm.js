import { Interpreter } from "./Interpreter.js";
import { hexToBytes, bytesToHex } from "./bytes.js";
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { Storage } from "./storage.js";

var transaction = {
    nonce: 1,
    from: "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5",
    to: null,
    data: "0x608060405234801561000f575f80fd5b50600360018190555061016f806100255f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c806360fe47b11461004357806395cacbe01461005f578063c82fdf361461007d575b5f80fd5b61005d600480360381019061005891906100e6565b61009b565b005b6100676100a4565b6040516100749190610120565b60405180910390f35b6100856100aa565b6040516100929190610120565b60405180910390f35b805f8190555050565b60015481565b5f5481565b5f80fd5b5f819050919050565b6100c5816100b3565b81146100cf575f80fd5b50565b5f813590506100e0816100bc565b92915050565b5f602082840312156100fb576100fa6100af565b5b5f610108848285016100d2565b91505092915050565b61011a816100b3565b82525050565b5f6020820190506101335f830184610111565b9291505056fea264697066735822122005c408db9d51b7388bee0e40bd0d42dfa065917597528e34f06f8d43578a302c64736f6c63430008150033",
    value: 0n
}

const WORLD_STATE = { "0x5Bc4d6760C24Eb7939d3D28A380ADd2EAfFc55d5": { nonce: 1, balance: 1000000n, code: null} };
const WORLD_STORAGE = new Storage();

const EVM = {
    state: WORLD_STATE,
    storage: WORLD_STORAGE,
    run: function(transaction) {
        const interpreter = new Interpreter(transaction, this);

        let returnData;

        try {
            returnData = interpreter.run();
        } catch (error) {
            if (error.message === 'STOP') {
                console.log('STOP');
            } else {
                console.log(error);
            }
        }

        console.log('stack:', interpreter.context.stack);
        console.log('memory:', interpreter.context.memory);
        console.log('returnData:', interpreter.context.returnData);

        if (transaction.to === null) {
            // 计算合约地址
            const fromBytes = hexToBytes(transaction.from);
            const nonceBytes = new Uint8Array([transaction.nonce]);
            const hash = keccak256(new Uint8Array(...fromBytes, ...nonceBytes))
            var contractAddress = '0x' + bytesToHex(hash).substring(26);

            // 初始化世界状态
            WORLD_STATE[contractAddress] = {
                nonce: 1,
                balance: 0,
                code: returnData
            }

            WORLD_STATE[transaction.from].nonce += 1

            WORLD_STORAGE.put(contractAddress);

            console.log("new contract created : " + contractAddress);
        }

        console.log("world state:", WORLD_STATE);
        console.log("world storage:", WORLD_STORAGE);
    }
}

EVM.run(transaction);

