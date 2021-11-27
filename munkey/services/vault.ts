import { randomUUID } from "crypto";
import PouchDB from "pouchdb";

import AdminService from "./admin";
import Service, { VaultDB, DatabaseDocument } from "./baseService";
import { PeerVaultDecl } from "../discovery";


export type DatabaseConstructor<X extends PouchDB.Database<T>, T> = {
    new<T>(name?: string, options?: PouchDB.Configuration.DatabaseConfiguration): X;
};

/**
 * @name VaultService
 * @summary IoC container for the application state of all PouchDB vaults.
 * @class
 */
export default class VaultService extends Service {
    private readonly vaultMap: Map<string, VaultDB>;
    private readonly vaultIdMap: Map<string, string>;
    private activeVault: [string | null, string | null];
    private adminService?: AdminService;

    constructor(private Vault: DatabaseConstructor<VaultDB, DatabaseDocument>) {
        super();
        this.vaultMap = new Map<string, VaultDB>();
        this.vaultIdMap = new Map<string, string>();
        this.activeVault = [null, null];
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
     * @param {string} encryptionKey Symmetric key used to encrypt/decrypt the contents of the vault.
     * @returns {string|null} UUID of new (or existing) PouchDB database.
     */
    public createVault(vaultName: string, vaultId?: string | null, encryptionKey?: Buffer | null): Promise<string | null>
    {
        if (!vaultName) {
            throw new ReferenceError(`Invalid vault name: ${vaultName}`);
        }

        vaultId ??= (this.vaultIdMap.get(vaultName) || null);
        let vault: VaultDB | null = vaultId && this.vaultMap.get(vaultId) || null;

        if (this.vaultIdMap.get(vaultName) && this.vaultIdMap.get(vaultName) !== vaultId) {
            throw new Error(`Name conflict; local nickname ${vaultName} already exists`);
        }
        else if (!vault) {
            // Vault not found; create it and initialize its schema.
            this.vaultIdMap.set(vaultName, vaultId ??= randomUUID());
            this.vaultMap.set(vaultId, vault = new this.Vault(vaultName));
            this.activeVault = [vaultName, vaultId];

            if (encryptionKey) {
                vault.useEncryption(encryptionKey);
            }

            return vault
                .getEncryptedAttachment("vault", "passwords.json")
                .then(() => {
                    this.logger.info("Database loaded successfully: id %s", vaultId);
                    return vaultId;
                })
                .catch(err => {
                    if (err.status === 404) {
                        this.logger.info("Database load failed; creating new instance: id %s", vaultId);
                        const blankAttachment = Buffer.from(JSON.stringify({}));
                        return vault
                            .putEncryptedAttachment("vault", "passwords.json", blankAttachment, "text/plain")
                            .then(() => {
                                this.logger.info("Database created successfully: id %s", vaultId);
                                return this.adminService?.recordVaultCreation(vaultName, vaultId);
                            })
                            .then(() => vaultId);
                    }
                    this.logger.error("Failed to create local database", err);
                    return null;
                });
        }

        return Promise.resolve(vaultId);
    }

    public async useAdminService(adminService: AdminService): Promise<this> {
        this.adminService = adminService;

        const vaultRecords = await this.adminService.getAllVaultRecords();
        await Promise.all(vaultRecords?.map(({ vaultName, vaultId }) =>
            this.createVault(vaultName, vaultId)
        ) ?? []);

        return this;
    }

    public async deleteVaultById(vaultId: string, vaultName: string): Promise<void> {
        const vault = this.vaultMap.get(vaultId);

        if (vault) {
            this.logger.info("Deleting...");

            this.activeVault = [null, null];
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
    public getVaultByName(vaultName: string): VaultDB | null {
        let vaultId: string | null = this.vaultIdMap.get(vaultName) || null;
        return vaultId && this.getVaultById(vaultId);
    }

    public async getVaultEntry(vaultId: string, entryKey: string): Promise<string | null> {
        const vault = this.getVaultById(vaultId) ?? null;
        const entries: { [key: string]: string } = await vault?.getEncryptedAttachment("vault", "passwords.json")
            .then((attachment: Buffer) => JSON.parse(attachment.toString()))
            .catch(err => {
                if (err.code === "ERR_OSSL_EVP_BAD_DECRYPT") {
                    this.logger.warn("Could not decrypt database contents");
                }
                else {
                    this.logger.error("An error occurred while decrypting database contents: %s", err.code);
                }
                return null;
            }) ?? {};
        return entries[entryKey] ?? null;
    }

    public getVaultById(vaultId: string): VaultDB | null {
        return this.vaultMap.get(vaultId) || null;
    }

    public setActiveVaultById(vaultId: string, vaultName: string = "unknown"): VaultDB | null {
        const vault = this.vaultMap.get(vaultId) || null;
        if (vault) {
            this.activeVault = [vaultName, vaultId];
        }
        return vault;
    }

    public setActiveVaultByName(vaultName: string): VaultDB | null {
        const vaultId: string = this.vaultIdMap.get(vaultName) || null;
        return this.setActiveVaultById(vaultId, vaultName);
    }

    public getActiveVault(): VaultDB | null {
        return this.vaultMap.get(this.getActiveVaultId()) || null;
    }

    public getActiveVaultId(): string | null {
        const [vaultName, vaultId] = this.activeVault;
        return vaultId;
    }

    public getActiveVaultName(): string | null {
        const [vaultName] = this.activeVault;
        return vaultName;
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
