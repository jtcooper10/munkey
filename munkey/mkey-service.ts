import PipeCommandServer from "./server/pipe";
import * as grpc from "@grpc/grpc-js";

async function main() {
    const cmd = new PipeCommandServer(null);
    const server = await cmd.useGrpc(new grpc.Server(), "127.0.0.1:8000");
    const message = await cmd.sendRequest();
    console.log("RESPONSE:", message);


    server.forceShutdown();
}

main()
    .then(() => console.log("Finished."));
