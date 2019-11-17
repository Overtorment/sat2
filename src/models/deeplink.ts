import { Send } from "./send";

export class Deeplink {
    private sendData: Send;
    private baseUri: string;

    constructor(data: Send, baseUri: string) {
        this.sendData = data;
        this.baseUri = baseUri;
    }

    get deeplink(): string {
        const link = this.plainlink;
        return "bluewallet://openlappbrowser?url=" + link;
    }

    get plainlink(): string {
        return encodeURI(this.baseUri + "/" + this.sendData.id);
    }
}