const grpc = require("./bin/ts/test_grpc_pb");
const pb = require("./bin/ts/test_pb");

module.exports = {
    ...grpc,
    ...pb,
};
