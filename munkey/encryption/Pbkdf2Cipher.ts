
import { EncryptionCipher, EncryptionAlgorithm } from "./EncryptionCipher";
import { pbkdf2 } from "crypto";


export type Pbkdf2HashAlgorithm = "sha256";

export interface Pbkdf2Options {
    readonly iterations?: number;
    readonly keyLength?: number;
    readonly hashAlgorithm?: Pbkdf2HashAlgorithm;
}


async function createPbkdf2Cipher(
    password: string, salt: string, options: Pbkdf2Options = {}): Promise<EncryptionCipher>
{
    const {
        iterations = 64000,
        keyLength = 24,
        hashAlgorithm = "sha256",
    } = options ?? {};

    const keyAlgorithm: EncryptionAlgorithm = (passBuf, saltBuf) => new Promise<Buffer>(function(resolve, reject) {
        pbkdf2(passBuf, saltBuf, iterations, keyLength, hashAlgorithm, (err, derivedKey) => {
            if (err) reject(err);
            else {
                resolve(derivedKey);
            }
        });
    });
    const key: Buffer = await EncryptionCipher.deriveKey(password, salt, keyAlgorithm);

    return new EncryptionCipher(key);
}

export {
    createPbkdf2Cipher,
};
