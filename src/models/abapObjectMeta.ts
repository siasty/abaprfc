/** Metadata stored next to each downloaded ABAP object as `.abapobj`. */
export interface AbapObjectMeta {
    /** ABAP object type */
    objectType: 'PROG' | 'FUNC';
    /** Object name (uppercase), e.g. "ZPROGRAM1" or "Z_MY_FUNCTION" */
    name: string;
    /** SAP destination this was downloaded from */
    dest: string;
    /** Function group name — only for objectType === 'FUNC' */
    functionGroup?: string;
    /** ISO 8601 timestamp of when the object was first downloaded */
    downloadedAt?: string;
    /** ISO 8601 timestamp of the last successful upload to SAP */
    lastUploadedAt?: string;
    /** Transport request number used in the last upload */
    lastTrkorr?: string;
}

/** Filename for the metadata sidecar file. */
export const ABAP_META_FILE = '.abapobj';
