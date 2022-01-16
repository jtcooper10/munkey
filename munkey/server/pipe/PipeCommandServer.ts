import * as grpc from "@grpc/grpc-js";

import CommandServer from "../CommandServer";
import { ServiceContainer } from "../../services";
import {
    IVaultServer,
    IVaultService,
    VaultService,
} from "@munkey/munkey-rpc";
import createVaultServer from "./rpc";

interface RpcContainer {
    vaultService: IVaultService;
}


export default class PipeCommandServer extends CommandServer {
    private readonly rpc: RpcContainer;

    public constructor(services: ServiceContainer, rpc?: RpcContainer) {
        super(services);
        this.rpc = rpc ?? {
            vaultService: VaultService,
        };
    }

    private static bindService(server: grpc.Server, credentials: grpc.ServerCredentials, address: string): Promise<grpc.Server> {
        return new Promise<grpc.Server>((resolve, reject) => {
            server.bindAsync(address, credentials, err => {
                if (err)
                    reject(err);
                server.start();
                resolve(server);
            })
        });
    }

    private get vaultServer(): IVaultServer {
        // The command server itself cannot implement the service methods itself.
        // This is because the `CommandServer` class has its own properties/methods,
        // which might accidentally get called by RPC (thus the UntypedHandleCall indexer).
        return createVaultServer(this);
    }

    public async useGrpc(server: grpc.Server, address: string = "127.0.0.1:8000"): Promise<grpc.Server> {
        server.addService(this.rpc.vaultService, this.vaultServer);
        await PipeCommandServer.bindService(server, grpc.ServerCredentials.createInsecure(), address);
        return server;
    }
};
