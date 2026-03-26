/** A single SAP Transport Request (change request). */
export interface TransportRequest {
    /** Transport number, e.g. "DEVK123456" */
    trkorr: string;
    /** Short description (AS4TEXT) */
    description: string;
    /** Owner (AS4USER) */
    owner: string;
    /**
     * Category:
     *   'K' = Workbench request
     *   'C' = Customizing request
     *   'T' = Transport of copies
     */
    category: string;
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
