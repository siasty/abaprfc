/**
 * Centralized RFC error description.
 * Converts raw RFC error dicts (from Python bridge) to user-readable messages.
 */
export function describeRfcError(error: any): string {
    if (!error || typeof error !== 'object') {
        return 'Unknown error';
    }

    const v1 = error['msg_v1'] as string | undefined;
    const key = error['key'] as string | undefined;
    const msg = Array.isArray(error['message'])
        ? error['message'].join(' ')
        : (error['message'] as string | undefined);

    switch (error['type']) {
        case 'LogonError':
            return `Login failed - ${msg || v1 || 'check user/password for this destination'}`;

        case 'CommunicationError':
            return `Cannot reach SAP system - ${msg || v1 || 'check host, sysnr and client'}`;

        case 'ABAPApplicationError':
            return `ABAP application error [${error['code'] ?? '?'}${key ? `/${key}` : ''}]: ${msg || v1 || 'no details'}`;

        case 'ABAPRuntimeError':
            return `ABAP runtime error${key ? ` [${key}]` : ''}: ${msg || v1 || 'no details'}`;

        case 'RFCError':
            return `RFC error${key ? ` [${key}]` : ''}: ${msg || v1 || 'no details'}`;

        default:
            return msg || v1 || key || error['type'] || 'Unknown RFC error';
    }
}

const RFC_ERROR_TYPES = new Set([
    'ABAPApplicationError',
    'ABAPRuntimeError',
    'CommunicationError',
    'LogonError',
    'RFCError',
]);

export function isRfcError(data: any): boolean {
    return data != null &&
        typeof data === 'object' &&
        RFC_ERROR_TYPES.has(data['type']);
}
