const lightningPayReq = require("bolt11");

export class Paym {

  _lightning: any;
  _decoded: any;

  constructor(lightning) {
    this._lightning = lightning;
  }

  addinvoice(amt, memo): Promise<string> {
    const that = this;
    return new Promise(function(resolve, reject) {
      that._lightning.addInvoice({ memo: memo, value: amt }, async function(err, info) {
        if (err) return reject(err);
        resolve(<string>info.payment_request);
      });
    });
  }

  lookupInvoice(invoice): Promise<object> {
    const that = this;
    return new Promise(function (resolve, reject) {
      const decoded = lightningPayReq.decode(invoice);
      let payment_hash = "";
      for (const tag of decoded.tags) {
        if (tag.tagName === "payment_hash") {
          payment_hash = tag.data;
        }
      }
      const request = {
        r_hash_str: payment_hash
      };

      that._lightning.lookupInvoice(request, async function(err, info) {
        if (err) return reject(err);
        // info.settled = true;
        resolve(info);
      });
    });
  }

  async decodePayReqViaRpc(invoice): Promise<any> {
    const that = this;
    return new Promise(function(resolve, reject) {
      that._lightning.decodePayReq({ pay_req: invoice }, function(err, info) {
        if (err) return reject(err);
        that._decoded = info;
        return resolve(info);
      });
    });
  }

  async sendPaymen(invoice): Promise<any> {
    return new Promise((resolve, reject) => {
          this._lightning.sendPaymentSync({
            payment_request: invoice,
            final_cltv_delta: 144,
            fee_limit: {
              percent: 10000
            },
          }, function(err, response) {
            if (err) return reject(err);
            resolve(response);
          });
    });
  }
}
