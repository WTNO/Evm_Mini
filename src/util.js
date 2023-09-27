export function concatBytes (...arrs) {
    if (arrs.length == 1) return arrs[0];

    // 计算传入数组总长度
    const length = arrs.reduce((total, arr) => {
        if (typeof arr != Uint8Array) {
            throw new Error('The arrs parameter must be of type Uint8Array')
        }
        total + arr.length
    }, 0);

    const newArr = new Uint8Array(length);

    let offset = 0;
    arrs.forEach(function(arr, index) {
        newArr.set(arr, offset);
        offset += arr.length;
    });

    return newArr;
}