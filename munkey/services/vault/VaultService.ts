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
        return new VaultDatabase(vaultDb, this.logger);
    }

    private setVaultEntry(vaultName: string, vaultId: string, vault: VaultDatabase): VaultDatabase {
        this.vaultMap.set(vaultId, vault);
        this.vaultIdMap.set(vaultName, vaultId);
        return vault;
    }

    public async createVault(vaultName: string,
                             vaultId?: string,
                             initialData?: Buffer): Promise<VaultOption<VaultDatabase>>
    {
        if (this.vaultIdMap.has(vaultName) || this.vaultMap.has(vaultId)) {
            return failItem({
                status: VaultStatus.CONFLICT,
                message: `Vault ${this.vaultIdMap.has(vaultName) ? `name "${vaultName}"` : `id "${vaultId}"`} in use`,
            });
        }

        const vaultDb = this.vaultContext.create(vaultName); // fails if the database already exists on-disk
        const vault = await VaultDatabase.create(vaultDb, initialData, this.logger);
        this.adminService?.recordVaultCreation(vaultName, vaultId);
        return successItem(this.setVaultEntry(vaultName, vaultId, vault));
    }

    public linkVault(vaultName: string, vaultId: string): VaultOption<VaultDatabase> {
        if (this.vaultIdMap.has(vaultName)) {
            return failItem<VaultDatabase, VaultStatus>({
                status: VaultStatus.CONFLICT,
                message: `Vault name ${vaultName} is in use`,
            });
        }

        let vault: VaultDatabase | null = this.getVaultById(vaultId);
        if (vault === null) {
            const vaultDb = this.vaultContext.create(vaultName);
            vault = new VaultDatabase(vaultDb, this.logger);
        }

        return successItem(this.setVaultEntry(vaultName, vaultId, vault));
    }

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

    public async useAdminService(adminService: AdminService): Promise<this> {
        this.adminService = adminService;

        const vaultRecords = await this.adminService.getAllVaultRecords();
        await Promise.all(vaultRecords?.map(({ vaultName, vaultId }) => {
            this.logger.info("Requesting initial vault load: %s[%s]", vaultName, vaultId);
            return this.loadVault(vaultName, vaultId);
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
