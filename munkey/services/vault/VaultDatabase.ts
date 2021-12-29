import winston from "winston";
import { VaultDB } from "../baseService";


export default class VaultDatabase {
    public readonly vault: VaultDB;
    private readonly logger?: winston.Logger;

    constructor(vault: VaultDB, logger?: winston.Logger) {
        this.vault = vault;
        this.logger = logger;
    }

    public static async create(vault: VaultDB, initialData: Buffer, logger?: winston.Logger): Promise<VaultDatabase> {
        await vault.getAttachment("vault", "passwords.json")
            .then(() => {
                logger?.info("Database loaded successfully: %s", vault.name);
            })
            .catch(err => {
                if (err.status === 404) {
                    logger?.info("Database load failed; creating new instance: %s", vault.name);
                    return vault.putAttachment("vault", "passwords.json", initialData, "text/plain");
                }
                return null;
            });

        return new VaultDatabase(vault, logger);
    }

    public destroy(): Promise<void> {
        return this.vault.destroy();
    }

    public get name(): string {
        return this.vault.name;
    }

    public getContent(): Promise<Buffer | null> {
        return this.vault.getAttachment("vault", "passwords.json")
            .catch(err => {
                if (err) {
                    this.logger?.error("An error occurred while retrieving database contents", err);
                }
                return null;
            });
    }

    public setContent(content: Buffer): Promise<boolean> {
        return content && this.vault
            .get("vault")
            .then(({ _rev }) => this.vault.putAttachment("vault", "passwords.json", _rev, content, "text/plain"))
            .then(result => result.ok.valueOf())
            .catch(err => {
                if (err?.status === 404) {
                    return this.vault.putAttachment("vault", "passwords.json", content, "text/plain")
                        .then(result => result.ok.valueOf())
                        .catch(err => {
                            this.logger?.error("An error occurred while initializing database contents", err);
                            return false;
                        });
                }
                else if (err) {
                    this.logger?.error("An error occurred while updating database contents", err);
                }
                return false;
            });
    }
}
