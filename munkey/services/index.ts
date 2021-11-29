import Service from "./baseService";
import VaultService from "./vault";
import IdentityService from "./identity";
import ActivityService from "./activity";
import ConnectionService from "./connection";
import WebService from "./web";
import AdminService from "./admin";

interface ServiceList {
    [serviceName: string]: Service;
}

export interface ServiceContainer extends ServiceList {
    vault: VaultService;
    identity: IdentityService;
    activity: ActivityService;
    connection: ConnectionService;
    web: WebService;
    admin: AdminService;
}

export * from "./baseService";
export * from "./vault";
export * from "./identity";
export * from "./activity";
export * from "./connection";
export * from "./web";
export * from "./admin";

export {
    VaultService,
    IdentityService,
    ActivityService,
    ConnectionService,
    WebService,
    AdminService,
};
