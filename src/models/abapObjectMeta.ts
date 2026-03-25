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
}

/** Filename for the metadata sidecar file. */
export const ABAP_META_FILE = '.abapobj';
