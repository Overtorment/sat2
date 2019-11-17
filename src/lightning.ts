// setup lnd rpc
let fs = require("fs");
let grpc = require("grpc");
let lnrpc = grpc.load("rpc.proto").lnrpc;
process.env.GRPC_SSL_CIPHER_SUITES = "HIGH+ECDSA";
let lndCert;
if (process.env.TLSCERT) {
  lndCert = Buffer.from(process.env.TLSCERT, "hex");
} else {
  lndCert = fs.readFileSync("tls.cert");
}
console.log("using tls.cert", lndCert.toString("hex"));
let sslCreds = grpc.credentials.createSsl(lndCert);
let macaroon;
if (process.env.MACAROON) {
  macaroon = process.env.MACAROON;
} else {
  macaroon = fs.readFileSync("admin.macaroon").toString("hex");
}
console.log("using macaroon", macaroon);
let macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(args, callback) {
  const metadata = new grpc.Metadata();
  metadata.add("macaroon", macaroon);
  callback(undefined, metadata);
});
let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

// trying to unlock the wallet:
if (process.env.LND_PASSWORD) {
  console.log("trying to unlock the wallet");
  const walletUnlocker = new lnrpc.WalletUnlocker(process.env.LND_URL, creds);
  walletUnlocker.unlockWallet(
    {
      wallet_password: Buffer.from(process.env.LND_PASSWORD).toString("base64"),
    },
    function(err, response) {
      if (err) {
        console.log("unlockWallet failed, probably because its been already unlocked");
      } else {
        console.log("unlockWallet:", response);
      }
    },
  );
}

module.exports = new lnrpc.Lightning(process.env.LND_URL, creds);
