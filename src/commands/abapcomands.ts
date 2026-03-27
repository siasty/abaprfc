export const abapRfcCommands = {
    addConnection:   'abaprfc.addConnection',
    editConnection:  'abaprfc.editConnection',
    testConnection:  'abaprfc.testConnection',
    getProgram:      'abaprfc.getProgram',
    getFunction:     'abaprfc.getFunction',
    searchProgram:   'abaprfc.searchProgram',
    searchFunction:  'abaprfc.searchFunction',
    uploadProgram:   'abaprfc.uploadProgram',
    syntaxCheck:     'abaprfc.syntaxCheck',
    diffWithSap:     'abaprfc.diffWithSap',
    styleCheck:      'abaprfc.styleCheck',
};

export const abapcmds: {
    name: string;
    func: (...x: any[]) => any;
    target: any;
}[] = [];

export const command = (name: string) => (target: any, propertyKey: string) => {
    const func = target[propertyKey];
    abapcmds.push({ name, target, func });
};
