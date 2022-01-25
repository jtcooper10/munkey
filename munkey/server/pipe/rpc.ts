import CommandServer from "../CommandServer";
import {
    IVaultServer,
    VaultActionResult,
    VaultCollection,
    VaultCollectionRequest,
    VaultCreationRequest,
    VaultData,
    VaultEntry,
    VaultRequest,
    VaultStatus as RpcVaultStatus,
} from "@munkey/munkey-rpc";
import {
    sendUnaryData,
    ServerUnaryCall,
    UntypedHandleCall,
} from "@grpc/grpc-js";
import {
    VaultOption,
    VaultResult,
    VaultStatus,
} from "../../services";
import { Status } from "../../error";

export default function createVaultServer<T extends CommandServer>(commands: T): IVaultServer {
    function mapVaultResult(result: VaultResult, respond: sendUnaryData<VaultActionResult>) {
        const response = new VaultActionResult()
            .setMessage(result.message)
            .setStatus(RpcVaultStatus.OK);

        if (!result.success) {
            switch (result.status) {
                case VaultStatus.NOT_FOUND:
                    response.setStatus(RpcVaultStatus.NOTFOUND);
                    break;
                default:
                    return respond(new Error(result.message));
            }
        }

        respond(null, response);
    }
    
    function mapVaultData(content: VaultOption<Buffer>, respond: sendUnaryData<VaultData>) {
        const response = new VaultData()
            .setStatus(RpcVaultStatus.OK);
        switch (content.status) {
            case VaultStatus.NOT_FOUND:
                response.setStatus(RpcVaultStatus.NOTFOUND);
                break;
            case Status.SUCCESS:
                response.setStatus(RpcVaultStatus.OK).setData(content.data);
                break;
            default:
                return respond(new Error(content.message));
        }
        
        respond(null, response);
    }
    
    class VaultServer implements IVaultServer {
        [name: string]: UntypedHandleCall;

        public createVault(call: ServerUnaryCall<VaultCreationRequest, VaultActionResult>,
                           respond: sendUnaryData<VaultActionResult>): void
        {
            commands
                .onCreateVault(call.request.getName(), Buffer.from(call.request.getInitialdata()))
                .then(opt => {
                    if (!opt.success) {
                        return respond(new Error(opt.message));
                    }
                    
                    respond(null, new VaultActionResult()
                        .setMessage(opt.message)
                        .setStatus(RpcVaultStatus.OK));
                });
        };

        public deleteVault(call: ServerUnaryCall<VaultRequest, VaultActionResult>,
                           respond: sendUnaryData<VaultActionResult>): void
        {
            commands.onDeleteVault(call.request.getName())
                .then(result => mapVaultResult(result, respond));
        }

        public getContent(call: ServerUnaryCall<VaultRequest, VaultData>,
                          respond: sendUnaryData<VaultData>): void {
            commands.onGetContent(call.request.getName())
                .then(content => mapVaultData(content, respond));
        }

        public async listVaults(call: ServerUnaryCall<VaultCollectionRequest, VaultCollection>,
                                respond: sendUnaryData<VaultCollection>): Promise<void>
        {
            const response = new VaultCollection().setSize(0);
            for await (const vault of commands.services.vault.getActiveVaults()) {
                response.addList(new VaultEntry()
                    .setName(vault.nickname)
                    .setId(vault.vaultId));
                response.setSize(response.getSize() + 1);
            }
            respond(null, response);
        }

        public setContent(call: ServerUnaryCall<VaultCreationRequest, VaultActionResult>,
                          respond: sendUnaryData<VaultActionResult>): void
        {
            commands.onSetContent(call.request.getName(), Buffer.from(call.request.getInitialdata()))
                .then(result => mapVaultResult(result, respond));
        }

    }

    return new VaultServer();
}
