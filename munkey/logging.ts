import winston from "winston";
import { ServiceContainer } from "./services";

export interface LoggingOptions {
    logLevel: "info" | "warning" | "error";
    loggingLocation?: string;
    useConsole?: boolean;
}

const uniformPrint = winston.format.printf(function(
    info: winston.Logform.TransformableInfo & { label: string, timestamp: string }): string
{
    let { timestamp, level, label, message, ...everythingElse } = info;
    if (everythingElse.name) {
        label = `${label}::${everythingElse.name}`;
    }
    if (everythingElse.code) {
        message = `${message} [${everythingElse.code}]`;
    }
    message = `${timestamp} [${level}::${label}] ${message}`;

    return message;
});

function addUniformLogger(serviceName: string, transports: winston.transport[]): winston.Logger {
    winston.loggers.add(serviceName, {
        format: winston.format.combine(
            winston.format.splat(),
            winston.format.label({ label: serviceName }),
            winston.format.timestamp(),
            uniformPrint,
        ),
        transports,
    });

    return winston.loggers.get(serviceName);
}

function getTransports(options: LoggingOptions): winston.transport[] {
    const {
        loggingLocation: filename = null,
        logLevel: level = "info",
        useConsole = false,
    } = options ?? {};
    let transports: winston.transport[] = [];

    if (filename) {
        const fileTransport = new winston.transports.File({ filename, level });
        transports.push(fileTransport);
    }
    if (useConsole) {
        const consoleTransport = new winston.transports.Console({ level });
        transports.push(consoleTransport);
    }

    return transports;
}

function configureLogging(services: ServiceContainer, options?: LoggingOptions): typeof services {
    const transports = getTransports(options);

    if (transports.length > 0) {
        Object.entries(services)
            .forEach(function([serviceName, service]) {
                service.useLogging(addUniformLogger(serviceName, transports));
            });
    }

    return services;
}

export {
    configureLogging,
};
