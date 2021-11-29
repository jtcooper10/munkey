import PouchDB from "pouchdb";

import Service from "./baseService";

export interface AdminDatabaseDocument {
    _id: string;
    vaultIds: { vaultName: string, vaultId: string }[];
}

export type AdminDB = PouchDB.Database<AdminDatabaseDocument>;

export default class AdminService extends Service {
    constructor(private adminDatabase: AdminDB) {
        super();
    }

    public initialize(): Promise<this> {
        return this.adminDatabase
            .get<AdminDatabaseDocument>("vaultIds")
            .then(() => {
                this.logger.info("Admin database validated successfully");
                return this;
            })
            .catch(err => {
                if (err.status === 404) {
                    return this.adminDatabase.put({
                        _id: "vaultIds",
                        vaultIds: [],
                    })
                        .then(doc => {
                            this.logger.info("Admin database initialization: %s", (doc.ok ? "Success" : "Failure"));
                            return this;
                        });
                }
                throw err;
            });
    }

    public recordVaultCreation(vaultName: string, vaultId: string): Promise<void> {
        return this.adminDatabase
            .get<AdminDatabaseDocument>("vaultIds")
            .then(doc => {
                const { _id, _rev, vaultIds } = doc;
                if (vaultIds.map(({ vaultId }) => vaultId).includes(vaultId)) {
                    this.logger.info("Skipping admin database record insert for %s[%s]", vaultName, vaultId);
                    return Promise.resolve();
                }
                return this.adminDatabase.put({
                        _id,
                        _rev,
                        vaultIds: [...vaultIds, { vaultName, vaultId }],
                    })
                    .then(result => {
                        this.logger.info("Vault record creation: %s", result.ok ? "Success" : "Failure");
                    });
            });
    }

    public async getAllVaultRecords(): Promise<{ vaultName: string, vaultId: string }[]> {
        const { vaultIds = [] } = await this.adminDatabase
            .get<AdminDatabaseDocument>("vaultIds")
            .catch(err => {
                if (err.status === 404) {
                    this.logger.error("Vault ID entries not found. Did you forget to initialize() the admin database?");
                }
                this.logger.error("Could not retrieve vault IDs from admin database: status %d", err.status, err);
                return null;
            }) ?? {};

        return vaultIds;
    }
}
