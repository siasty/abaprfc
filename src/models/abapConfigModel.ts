export class AbapRfcConfigModel {
    dest: string;
    ashost: string;
    user: string;
    passwd: string;
    sysnr: string;
    client: string;
    lang: string;
    constructor(dest: string, ashost: string, user: string, passwd: string, sysnr: string, client: string, lang: string) {
        this.dest = dest;
        this.ashost = ashost;
        this.user = user;
        this.passwd = passwd;
        this.sysnr = sysnr;
        this.client = client;
        this.lang = lang;
    }
    getJson() {
        return JSON.stringify(this);
    }
}[];