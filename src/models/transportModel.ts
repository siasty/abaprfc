/** A single SAP Transport Request (change request). */
export interface TransportRequest {
    /** Transport number, e.g. "DEVK123456" */
    trkorr: string;
    /** Short description shown in the UI */
    description: string;
    /** Owner (AS4USER) */
    owner: string;
    /**
     * Category from TRFUNCTION:
     *   'K' = Workbench request
     *   'W' = Customizing request
     *   'T' = Transport of copies
     */
    category: string;
    /** Target system from TARSYSTEM */
    targetSystem?: string;
    /** Status from TRSTATUS, e.g. 'D' */
    status?: string;
    /** Parent request from STRKORR for tasks */
    parentTrkorr?: string;
}

/** An ABAP object that can be assigned to a transport. */
export interface AbapObjectRef {
    /** Program/include name (uppercase) */
    name: string;
    /** SAP object type — 'PROG' for programs and includes */
    objectType: 'PROG';
    /** SAP program ID */
    pgmid: 'R3TR';
}

/** Result of a single upload operation. */
export interface UploadResult {
    success: boolean;
    programName: string;
    trkorr: string;
    message?: string;
}
