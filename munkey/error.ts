
enum Status {
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE",
}

interface Result<K = {}> {
    readonly status: Status | K;
    readonly success: boolean;
    readonly message: string;
}

interface Option<T, K = {}> extends Result<K> {
    data: T | null | undefined;
    unpack: (option: T) => T;
}

export {
    Status,
    Result,
    Option,
}
