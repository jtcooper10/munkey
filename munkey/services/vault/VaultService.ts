import Service, { DatabaseDocument } from "../baseService";
import AdminService from "../admin";
import { DatabaseContext, Vault, VaultOption, VaultStatus } from "./constructor";
import { DatabasePluginAttachment } from "../../pouch";
import { failItem,  successItem } from "../../error";
import { PeerVaultDecl } from "../../discovery";
import VaultDatabase from "./VaultDatabase";


/**
 * @name VaultService
 * @summary IoC container for the application state of all PouchDB vaults.
 * @class
 */
export default class VaultService extends Service {
    private readonly vaultMap: Map<string, VaultDatabase>;
    private readonly vaultIdMap: Map<string, string>;
    private adminService?: AdminService;

    constructor(private vaultContext: DatabaseContext<DatabaseDocument, DatabasePluginAttachment>) {
        super();
        this.vaultMap = new Map<string, VaultDatabase>();
        this.vaultIdMap = new Map<string, string>();
        this.adminService = null;
    }

    private vaultExists(vaultName: string): boolean {
        return this.vaultIdMap.has(vaultName);
    }

    private loadVaultDb(vaultName: string): VaultDatabase {
        const vaultDb = this.vaultContext.load(vaultName);
        return new VaultDatabase(vaultDb, this.vaultIdMap.get(vaultName), this.logger);
    }

    private setVaultEntry(vaultName: string, vaultId: string, vault: VaultDatabase): VaultDatabase {
        this.vaultMap.set(vaultId, vault);
        this.vaultIdMap.set(vaultName, vaultId);
        return vault;
    }

    /**
     * @name createVault
     * @method
     * @summary Create a new, empty vault if no vault with the given name exists.
     *
     * Create a new vault from scratch and load it from disk.
     * Intended for when the user requests creation of a brand new, empty vault.
     * The vault file will be initialized to the provided buffer.
     *
     * @param vaultName
     * @param vaultId {string} Globally unique identifier
     * @param initialData {Buffer} Node.js Buffer object containing initial content of the new vault's "vault" file.
     *
     * @returns option object containing the newly created {@link VaultDatabase} wrapper object.
     * Fails if the given name or vault ID is already in use.
     * Fails if
     */
    public createVault(vaultName: string,
                       vaultId?: string,
                       initialData?: Buffer): VaultOption<VaultDatabase>
    {
        if (this.vaultIdMap.has(vaultName) || this.vaultMap.has(vaultId)) {
            return failItem({
                status: VaultStatus.CONFLICT,
                message: `Vault ${this.vaultIdMap.has(vaultName) ? `name "${vaultName}"` : `id "${vaultId}"`} in use`,
            });
        }

        const vaultDb = this.vaultContext.create(vaultName); // fails if the database already exists on-disk
        const vault = new VaultDatabase(vaultDb, vaultId, this.logger);
        return successItem(this.setVaultEntry(vaultName, vaultId, vault));
    }

    /**
     * @name linkVault
     * @method
     * @summary Map a new nickname to a vault with the given ID, creating it if it does not exist.
     *
     * Map the given vault name to the given vault ID.
     * This allows multiple nicknames to be associated with the same vault,
     * or allows creating a local copy of a remote database.
     * If no vault with that ID exists, then it is created.
     *
     * @param vaultName {string} Vault nickname to assign as an alias to the vault.
     * @param vaultId {string} Vault ID to assign the given nickname as an alias to.
     *
     * @returns Option object containing a database object corresponding to the given vault ID.
     * Indicates {@link VaultStatus.CONFLICT} if the given nickname already exists in-memory.
     */
    public linkVault(vaultName: string, vaultId: string): VaultOption<VaultDatabase> {
        if (this.vaultIdMap.has(vaultName)) {
            return failItem<VaultDatabase, VaultStatus>({
                status: VaultStatus.CONFLICT,
                message: `Vault name ${vaultName} is in use`,
            });
        }

        let vault: VaultDatabase | null = this.getVaultById(vaultId);
        if (vault === null) {
            return this.createVault(vaultName, vaultId);
        }

        this.vaultIdMap.set(vaultName, vaultId);
        return successItem(vault);
    }

    /**
     * @name loadVault
     * @method
     * @summary Load the specified vault from disk into the vault service context.
     *
     * Loads the vault with the given name from disk into memory.
     * It is loaded with the provided vault ID (NOTE: this behavior may be deprecated with the identity system).
     *
     * @param vaultName {string} Locally unique vault name to attempt to load from disk.
     * @param vaultId {string} Globally unique vault ID to assign to the created vault.
     *
     * @returns Option object containing the newly loaded database object.
     * Indicates {@link VaultStatus.CONFLICT} if the given nickname or vault ID already exists.
     */
    public loadVault(vaultName: string, vaultId: string): VaultOption<VaultDatabase> {
        if (this.vaultExists(vaultName)) {
            // Conflict; vault is already loaded into memory
            return failItem({
                status: VaultStatus.CONFLICT,
                message: `Name conflict with vault name "${vaultName}"`,
            });
        }
        else if (this.vaultMap.has(vaultId)) {
            // Conflict; vault ID is already in use
            return failItem({
                status: VaultStatus.CONFLICT,
                message: `Vault ID "${vaultId}" is already in use`,
            });
        }

        try {
            const vault = this.loadVaultDb(vaultName);
            this.setVaultEntry(vaultName, vaultId, vault);
            return successItem<VaultDatabase, VaultStatus>(vault);
        }
        catch (err) {
            return failItem<VaultDatabase, VaultStatus>({
                message: err?.message ?? "An unknown error occurred",
            });
        }
    }

    /**
     * @name useAdminService
     * @method
     * @summary Attach administrator database service to the vault service.
     *
     * The provided admin service will be notified on essential operations.
     * This includes the creation of databases, or any other long-term persisted data.
     * Only one admin service container may be attached to each vault service container.
     *
     * @param adminService {AdminService} Admin service container to attach.
     * @returns {VaultService} Pass-through of vault container object.
     */
    public async useAdminService(adminService: AdminService): Promise<this> {
        this.adminService = adminService;

        const vaultRecords = await this.adminService.getAllVaultRecords();
        await Promise.all(vaultRecords?.map(({ vaultName, vaultId }) => {
            this.logger.info("Requesting initial vault load: %s[%s]", vaultName, vaultId);
            return this.loadVault(vaultName, vaultId);
        }) ?? []);

        return this;
    }

    /**
     * @name deleteVaultById
     * @method
     * @summary Remove the vault and all entries associated with the given vault ID.
     *
     * The vault with the associated vault ID is removed and properly destroyed,
     * as well as any locally unique vault names which referenced that vault ID.
     * The vault names that were removed are returned as an array.
     *
     * @param vaultId {string} ID of the vault to delete.
     * @returns {string[]} Array of locally unique vault names which were deleted.
     */
    public async deleteVaultById(vaultId: string): Promise<string[]> {
        let deletedVaults: string[] = [];
        let vault = this.vaultMap.get(vaultId) ?? null;

        if (!vault) {
            return deletedVaults;
        }
        await vault.destroy();

        for (let [name, id] of this.vaultIdMap.entries()) {
            if (id === vaultId && this.vaultIdMap.delete(name)) {
                deletedVaults.push(name);
            }
        }
        this.vaultMap.delete(vaultId);

        return deletedVaults;
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

    public _getVaultByName(vaultName: string): Vault | null {
        const vaultId: string | null = this.vaultIdMap.get(vaultName) ?? null;

        return vaultId !== null
            ? this._getVaultById(vaultId)
            : null;
    }

    public _getVaultById(vaultId: string): Vault | null {
        const deleteAllNamedEntries = () => {
            const mappedNames: string[] = [];
            for (let [name, id] of this.vaultIdMap.entries()) {
                if (id === vaultId) {
                    mappedNames.push(name);
                    this.logger.info("Vault name entry %s queued for deletion", name, { vaultId });
                }
            }
            mappedNames.map(name => {
                if (!this.vaultIdMap.delete(name))
                    this.logger.warning("Could not delete vault name entry for %s; no longer exists", name, { vaultId });
            });
        };

        const vault = this.vaultMap.get(vaultId);
        if (!vault) {
            return null;
        }

        // ========== VAULT CONTEXT FUNCTIONS ==========
        // This may need to be abstracted away into a class,
        // rather than an interface, in the future.
        // For now, the ability to destructure only
        // the functions you need seems worth it.

        const deleteVault: () => Promise<VaultOption<string>> = async () => {
            this.logger.info("Deleting...");

            // Remove all named entries before proceeding with deletion.
            // While any existing references will be invalidated,
            // no new ones can be extracted.
            deleteAllNamedEntries();
            if (this.vaultMap.delete(vaultId))
                this.logger.info("Vault map entry %s queued for deletion", vaultId);
            else
                this.logger.warning("Deleted vault %s not present in vault map");

            try {
                await vault.destroy();
                this.logger.info("Vault %s deleted successfully", vaultId);
            }
            catch (err) {
                this.logger.error("Failed to delete database with ID %s", vaultId, err);
                return failItem({ message: `Failed to delete vault ${vaultId}` });
            }

            return successItem(vaultId, {
                message: `Vault ${vaultId} deleted successfully`
            });
        };

        return {
            delete: deleteVault,
        };
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
     * Similar to the method {@link VaultService#getActiveVaults}, but returns a complete list instead of iterating.
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
}
