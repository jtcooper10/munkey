import winston from "winston";
import { ServiceContainer } from "./services";

const uniformPrint = winston.format.printf(function(
    info: winston.Logform.TransformableInfo & { label: string, timestamp: string }): string
{
    let { level, label, message } = info;
    return `[${level}::${label}] ${message}`;
});

const addUniformLogger = function(serviceName: string): winston.Logger {
    winston.loggers.add(serviceName, {
        format: winston.format.combine(
            winston.format.splat(),
            winston.format.colorize(),
            winston.format.label({ label: serviceName }),
            uniformPrint,
        ),
        transports: [
            new winston.transports.Console({ level: "info" }),
        ]
    });

    return winston.loggers.get(serviceName);
};

function configureLogging(services: ServiceContainer): typeof services {
    Object.entries(services)
        .forEach(function([serviceName, service]) {
            service.useLogging(addUniformLogger(serviceName));
        });

    return services;
}

export {
    configureLogging,
};
