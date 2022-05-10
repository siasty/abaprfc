export const abapRfcCommands = {
    addConnection: "abaprfc.addConnection",
    getProgram: "abaprfc.getProgram",
  };
  
  export const abapcmds: {
    name: string
    func: (...x: any[]) => any
    target: any
  }[] = [];
  
  export const command = (name: string) => (target: any, propertyKey: string) => {
    const func = target[propertyKey];
    abapcmds.push({ name, target, func });
  };