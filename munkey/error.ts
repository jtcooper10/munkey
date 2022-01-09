
enum Status {
    SUCCESS = 0,
    FAILURE = 15,
}

interface Result<K = {}> {
    readonly status: Status | K;
    readonly success: boolean;
    readonly message?: string;
}

interface Option<T, K = {}> extends Result<K> {
    data: T | null | undefined;
    unpack: (option: T) => T;
}

function success<K>(overrides: Partial<Result<K>> = {}): Result<K> {
    const { message = null } = overrides;

    return {
        status: Status.SUCCESS,
        success: true,
        message,
    };
}

function fail<K>(overrides: Partial<Result<K>> = {}): Result<K> {
    const { message = null } = overrides;

    return {
        status: Status.FAILURE,
        success: false,
        message,
    };
}

function successItem<T, K>(item: T, overrides: Partial<Option<T, K>> = {}): Option<T, K> {
    const {
        message = null,
        data = item,
        status = Status.SUCCESS,
    } = overrides;

    return {
        status,
        success: true,
        message,
        data,
        unpack: () => data,
    };
}

function failItem<T, K>(overrides: Partial<Option<T, K>> = {}): Option<T, K> {
    const {
        message = null,
        data = null,
        status = Status.FAILURE,
    } = overrides;

    return {
        status,
        success: false,
        message,
        data,
        unpack: option => option,
    };
}

export {
    Status,
    Result,
    Option,
    success,
    successItem,
    fail,
    failItem,
}
