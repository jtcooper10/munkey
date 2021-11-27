import path from "path";
import { readFile } from "fs";
import { randomUUID } from "crypto";

import Service from "./baseService";

export interface TlsKeyPair {
    key: Buffer,
    cert: Buffer,
}

/**
 * @name IdentityService
 * @summary Service container for local identity information.
 * @description Service container which manages known identities on the network.
 * The identifier for each device is required to be unique within any particular vault network,
 * and must correspond to the public/private key-pair of the same identity.
 * The identity's key-pair is used to validate the identity for each request.
 * @class
 */
export default class IdentityService extends Service {
    private readonly uniqueId: string;
    constructor(uniqueId: string, private readonly keyPair?: TlsKeyPair) {
        super();
        this.uniqueId = uniqueId;
    }

    /**
     * @name getId
     * @description Get the unique identifier for the local device's identity.
     *
     * @returns String representing the UUID of the local device's identity.
     */
    public getId(): string {
        return this.uniqueId;
    }

    public static loadTlsKeyPair(rootDir: string,
                                 keyPath: string = path.join(rootDir, "tls.key"),
                                 certPath: string = path.join(rootDir, "tls.crt")): Promise<TlsKeyPair>
    {
        return Promise.all([
            IdentityService.loadKey(keyPath),
            IdentityService.loadKey(certPath)
        ])
            .then(([ key, cert ]) => ({ key, cert }));
    }

    private static loadKey(keyPath: string): Promise<Buffer> {
        return new Promise<Buffer>(function(resolve, reject) {
            readFile(keyPath, (err, data: Buffer) => {
                if (err) reject(err);
                else {
                    resolve(data);
                }
            });
        });
    }

    public getTlsKeyPair(): TlsKeyPair {
        return this.keyPair;
    }
}

/**
 * @name generateNewIdentity
 * @summary Create a brand-new identity object (as of v0.0.1, just a string) from random.
 * @function
 *
 * @returns Promise which resolves to a new unique identifier string.
 */
async function generateNewIdentity(rootDir: string): Promise<{ uniqueId: string } & TlsKeyPair> {
    const keyPair = await IdentityService.loadTlsKeyPair(rootDir)
        .catch(err => {
            console.error("Could not load TLS certificate:", err);
            return { key: undefined, cert: undefined };
        });

    return {
        uniqueId: randomUUID(),
        ...keyPair,
    };
}

export {
    generateNewIdentity,
};
