import { randomUUID } from "crypto";
import PouchDB from "pouchdb";
import winston from "winston";

import AdminService from "./admin";
import Service, { VaultDB, DatabaseDocument } from "./baseService";
import { PeerVaultDecl } from "../discovery";
import {EncryptionCipher} from "../pouch";


export type DatabaseConstructor<T extends PouchDB.Database<D>, D>
    = (name?: string, options?: PouchDB.Configuration.DatabaseConfiguration) => T;

class VaultDatabase {
    public readonly vault: VaultDB;
    private readonly logger?: winston.Logger;

    private constructor(vault: VaultDB, logger?: winston.Logger) {
        this.vault = vault;
        this.logger = logger;
    }

    public static async create(vault: VaultDB, logger?: winston.Logger): Promise<VaultDatabase> {
        await vault.getEncryptedAttachment("vault", "passwords.json")
            .then(() => {
                logger?.info("Database loaded successfully: %s", vault.name);
            })
            .catch(err => {
                if (err.status === 404) {
                    logger?.info("Database load failed; creating new instance: %s", vault.name);
                    const blankAttachment = Buffer.from(JSON.stringify({}));
                    return vault.putEncryptedAttachment("vault", "passwords.json", blankAttachment, "text/plain");
                }
                return null;
            });

        return Promise.resolve(new VaultDatabase(vault, logger));
    }

    public destroy(): Promise<void> {
        return this.vault.destroy();
    }

    public get name(): string {
        return this.vault.name;
    }

    public getContent(): Promise<{ [key: string]: string } | null> {
        return this.vault.getEncryptedAttachment("vault", "passwords.json")
            .then((attachment: Buffer) => JSON.parse(attachment.toString()))
            .catch(err => {
                if (err?.code === "ERR_OSSL_EVP_BAD_DECRYPT") {
                    this.logger?.warn("Could not decrypt database contents");
                }
                else {
                    this.logger?.error("An error occurred while decrypting database contents: %s", err);
                }
                return null;
            });
    }

    public async getEntry(entryKey: string): Promise<string | null> {
        const entries: { [key: string]: string } = (await this.getContent()) ?? {};
        return entries[entryKey];
    }

    public async setEntry(entryKey: string, entryValue: string): Promise<string | null> {
        let entries = await this.getContent();
        if (entries === null) {
            return null;
        }

        entries ??= {};
        entries = { ...entries, [entryKey]: entryValue };

        const { _rev } = await this.vault
            .get("vault")
            .catch(() => ({ _rev: null }));

        if (_rev) {
            await this.vault
                .putEncryptedAttachment("vault", "passwords.json", _rev,
                    Buffer.from(JSON.stringify(entries)), "text/plain")
                .catch(err => {
                    if (["ERR_OSSL_EVP_BAD_DECRYPT"].includes(err?.code)) {
                        this.logger?.warn("Failed to encrypt database (bad password)");
                    }
                    else {
                        this.logger?.error("Failed to encrypt database");
                    }
                    return null;
                });

            return entryValue;
        }

        return null;
    }

    public setPassword(cipher: EncryptionCipher) {
        this.vault.useEncryption(cipher);
    }
}

/**
 * @name VaultService
 * @summary IoC container for the application state of all PouchDB vaults.
 * @class
 */
export default class VaultService extends Service {
    private readonly vaultMap: Map<string, VaultDatabase>;
    private readonly vaultIdMap: Map<string, string>;
    private adminService?: AdminService;

    constructor(private Vault: DatabaseConstructor<VaultDB, DatabaseDocument>) {
        super();
        this.vaultMap = new Map<string, VaultDatabase>();
        this.vaultIdMap = new Map<string, string>();
        this.adminService = null;
    }

    /**
     * @name createVault
     * @description Find or generate the vault with the given ID.
     * If a vault with that ID doesn't exist yet, it is created.
     * If a vault with that ID already exists, it is returned unmodified.
     *
     * @param {string} vaultName Unique "nickname" corresponding to the desired vault.
     * The vault is issued a new, randomly generated UUID on creation.
     * @param {string} vaultId Suggested UUID for the new vault.
     * Recommended only when the vault you are creating already exists.
     * @param {EncryptionCipher} cipher Symmetric key used to encrypt/decrypt the contents of the vault.
     * @returns {string|null} UUID of new (or existing) PouchDB database.
     */
    public createVault(vaultName: string, vaultId?: string | null, cipher?: EncryptionCipher | null): Promise<string | null>
    {
        if (!vaultName) {
            throw new ReferenceError(`Invalid vault name: ${vaultName}`);
        }

        vaultId ??= (this.vaultIdMap.get(vaultName) || null);
        let vault: VaultDatabase | null = vaultId && this.getVaultById(vaultId) || null;

        if (this.vaultIdMap.get(vaultName) && this.vaultIdMap.get(vaultName) !== vaultId) {
            throw new Error(`Name conflict; local nickname ${vaultName} already exists`);
        }
        else if (!vault) {
            const vaultDb = this.Vault(vaultName);
            if (cipher) {
                vaultDb.useEncryption(cipher);
            }

            return VaultDatabase.create(vaultDb, this.logger)
                .then(newVault => {
                    this.vaultIdMap.set(vaultName, vaultId ??= randomUUID());
                    this.vaultMap.set(vaultId, newVault);
                    this.adminService?.recordVaultCreation(newVault.name, vaultId)
                        .catch(err => this.logger.error("Could not update admin records: ", err));
                    return this.vaultIdMap.get(vaultName);
                });
        }

        return Promise.resolve(vaultId);
    }

    public async useAdminService(adminService: AdminService): Promise<this> {
        this.adminService = adminService;

        const vaultRecords = await this.adminService.getAllVaultRecords();
        await Promise.all(vaultRecords?.map(({ vaultName, vaultId }) => {
            this.logger.info("Requesting initial vault load: %s[%s]", vaultName, vaultId);
            return this.createVault(vaultName, vaultId);
        }) ?? []);

        return this;
    }

    public async deleteVaultById(vaultId: string, vaultName: string): Promise<void> {
        const vault = this.vaultMap.get(vaultId);

        if (vault) {
            this.logger.info("Deleting...");

            this.vaultMap.delete(vaultId);
            this.vaultIdMap.delete(vaultName);
            await vault.destroy()
                .catch(err => this.logger.error("Failed to delete database with ID %s", vaultId, err));
        }
        else {
            this.logger.error(`Could not resolve vault ID ${vaultId}`, { action: "delete" });
        }
    }

    public async deleteVaultByName(vaultName: string): Promise<void> {
        const vaultId: string = this.vaultIdMap.get(vaultName);

        if (vaultId) {
            await this.deleteVaultById(vaultId, vaultName);
        }
        else {
            this.logger.warning(`Could not resolve local vault name: ${vaultName}`, { action: "delete" });
        }
    }

    /**
     * @name getVaultByName
     * @description Find the vault with the given ID.
     * If none exists with that ID, returns undefined.
     *
     * @returns PouchDB instance if one with the provided ID exists.
     * Otherwise, returns undefined.
     */
    public getVaultByName(vaultName: string): VaultDatabase | null {
        let vaultId: string | null = this.vaultIdMap.get(vaultName) || null;
        return vaultId && this.getVaultById(vaultId);
    }

    public async getVaultEntry(vaultId: string, entryKey: string): Promise<string | null | undefined> {
        const vault = this.getVaultById(vaultId) ?? null;
        return vault?.getEntry(entryKey);
    }

    public getVaultById(vaultId: string): VaultDatabase | null {
        return this.vaultMap.get(vaultId) || null;
    }

    /**
     * @name getActiveVaults
     * @summary Iterate over the internal vault list as Peer Vault Declaration records.
     * @description Return the unique Peer Vault Declaration record for each active vault in the container.
     * No guarantees are made by the function in terms of race conditions.
     * If, for example, a new vault entry is added before the vault iteration completes,
     * it is not guaranteed that the new entry will be made visible to the iterator.
     *
     * @returns Async iterable which resolves to a unique Peer Vault Declaration record on each iteration.
     */
    public async* getActiveVaults(): AsyncIterable<PeerVaultDecl> {
        for (let [vaultName, vaultId] of this.vaultIdMap) {
            yield {
                nickname: vaultName,
                vaultId: vaultId,
            };
        }
    }

    /**
     * @name getActiveVaultList
     * @summary Generate a list of active Peer Vault Declaration records.
     * @description Generate an array containing the Peer Vault Declaration record for all active vaults.
     * Similar to the method {@link Vault#getActiveVaults}, but returns a complete list instead of iterating.
     * No guarantees are made by the function in terms of race conditions.
     * If, for example, a new vault entry is added before the vault iteration completes,
     * it is not guaranteed that the new entry will be made visible to the iterator.
     *
     * @returns Promise which resolves to a {@link PeerVaultDecl} array.
     */
    public async getActiveVaultList(): Promise<PeerVaultDecl[]> {
        const vaultList: PeerVaultDecl[] = [];
        for await (let vault of this.getActiveVaults()) {
            vaultList.push(vault);
        }
        return vaultList;
    }

    public getVaultConstructor(): DatabaseConstructor<VaultDB, DatabaseDocument> {
        return this.Vault;
    }
}

export {
    VaultDatabase,
};
