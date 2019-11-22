const getPublicKey = (key: any): string => {
    const modulus = key.n;
    const exponent = key.e;
    const mod = convertToHex(modulus);
    const exp = convertToHex(exponent);
    const encModLen = encodeLength(mod.length / 2);
    const encExpLen = encodeLength(exp.length / 2);
    const part = [mod, exp, encModLen, encExpLen].map(n => n.length / 2).reduce((a, b) => a + b);
    const bufferSource = `30${encodeLength(part + 2)}02${encModLen}${mod}02${encExpLen}${exp}`;
    const pubkey = Buffer.from(bufferSource, 'hex').toString('base64');

    /* istanbul ignore next */
    return (
        '-----BEGIN RSA PUBLIC KEY-----\n' +
        (pubkey.match(/.{1,64}/g) || []).join('\n') +
        '\n-----END RSA PUBLIC KEY-----\n'
    );
};

const convertToHex = (str: string): string => {
    const hex = Buffer.from(str, 'base64').toString('hex');

    return hex[0] < '0' || hex[0] > '7' ? `00${hex}` : hex;
};

const toHex = (n: number): string => {
    const str = n.toString(16);

    return str.length % 2 ? `0${str}` : str;
};

const toLongHex = (n: number): string => {
    const str = toHex(n);
    const lengthByteLength = 128 + str.length / 2;

    return toHex(lengthByteLength) + str;
};

const encodeLength = (n: number) => {
    return n <= 127 ? toHex(n) : toLongHex(n);
};

export { getPublicKey };
