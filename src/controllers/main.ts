import { Request, Response } from "express";
import { Send } from "../models/send";
import { Paym } from "../models/paym";
import { Deeplink } from "../models/deeplink";
import { MyRequest } from "../models/myRequest";
const qr = require("qr-image");
const crypto = require("crypto");
const fs = require("fs");
const nanoid = require("nanoid");
const mysql = require("../util/mysql");
const lightning = require("../lightning");


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);


export let createSend = async (req: MyRequest, res: Response) => {
  req.assert("tel", "tel cannot be blank").notEmpty();
  req.assert("sat", "Sat is not valid").notEmpty();
  req.assert("sat", "Sat is not valid").isDecimal();
  req.assert("sat", "Should be more than 100 satoshis").isInt({ gt: 99});

  if (!(req.params.tel = await validatePhoneNumber(req.params.tel))) {
    req.assert("tel", "invalid phone number").equals("I wish I knew a better way to do this");
  }

  const errors = req.validationErrors();
  console.log(errors);

  if (errors) {
    req.flash("errors", errors);
    return res.redirect("/");
  }

  let newId = <string>"";
  let length = 5;
  while (length < 200) {
    newId = nanoid(length++);
    const [rows, fields] = await mysql.getPoolConnection().execute("select * FROM Send WHERE id = ?", [newId]);
    if (rows.length === 0) break;
  }
  req.log("created Send id: " + newId);

  const newSend = <Send>{};
  newSend.created = Math.floor(+new Date() / 1000);
  newSend.id = newId;
  newSend.phone = req.params.tel;
  newSend.satoshis = parseInt(req.params.sat);
  newSend.refill_satoshis = newSend.satoshis + Math.ceil(newSend.satoshis * 0.01) + 1 /* sms price */;
  const p = new Paym(lightning);
  newSend.refill_bolt11 = await p.addinvoice(newSend.refill_satoshis, "Send sats via sat2.io");
  newSend.refill_bolt11_paid = false;
  const link = new Deeplink(newSend, /* req.protocol + */ "https://" + req.get("host"));

  await mysql.getPoolConnection().execute("INSERT INTO Send SET id = ?, json = ?", [newId, JSON.stringify(newSend)]);

  res.render("send", {
    tel: req.params.tel,
    sat: newSend.refill_satoshis,
    refill_bolt11: newSend.refill_bolt11,
    link: link.plainlink,
    newId
  });
};

export let getSend = async (req: MyRequest, res: Response) => {
  if ("/favicon.ico" === req.originalUrl) return res.redirect("/images/favicon.png");
  req.assert("id", "id cannot be blank").notEmpty();

  if (req.params.id === "apple-app-site-association") {
    return res.json(({
          "applinks": {
            "apps": [],
            "details": [
              {
                "appID": "A7W54YZ4WU.io.bluewallet.bluewallet",
                "paths": [
                  "*",
                ]
              }
            ]
          }
        }
    ));
  }

  const errors = req.validationErrors();

  if (errors) {
    req.flash("errors", errors);
    return res.redirect("/");
  }

  const [rows, fields] = await mysql.getPoolConnection().execute("select * FROM Send WHERE id = ? AND json->\"$.refill_bolt11_paid\" = true AND (json->\"$.withdraw_bolt11_paid\" = false OR ISNULL(json->\"$.withdraw_bolt11_paid\")) LIMIT 1;", [req.params.id]);
  if (rows.length === 0) {
    req.log("Send not found");
    return res.send("Those satoshis were already claimed!");
  }
  const Send =  <Send>rows[0].json;
  const link = new Deeplink(Send, /* req.protocol + */ "https://" + req.get("host"));
  req.log("Send found, deeplink: " + link.deeplink);

  res.render("withdraw", {
    id: req.params.id,
    Send,
    deeplink: link.deeplink
  });
};

export let payInvoice = async (req: MyRequest, res: Response) => {
  req.assert("invoice", "invoice cannot be blank").notEmpty();
  req.assert("id", "invoice cannot be blank").notEmpty();
  const errors = req.validationErrors();
  if (errors) {
    req.flash("errors", errors);
    return res.redirect("/");
  }

  req.log("was asked to pay invoice " + req.params.invoice + " with id " + req.params.id);

  const lockName = require("crypto").createHash("md5").update(req.params.id).digest("hex");
  const [rows_lock, fields_lock] = await mysql.getPoolConnection().execute("select GET_LOCK(?, 5) as result;", [lockName]);
  if (rows_lock[0].result === 1) {
     // nop
  } else {
    req.log("lock failed");
    return res.send({error: "try again later"});
  }

  const [rows, fields] = await mysql.getPoolConnection().execute("select * FROM Send WHERE id = ? AND json->\"$.refill_bolt11_paid\" = true AND (json->\"$.withdraw_bolt11_paid\" = false OR ISNULL(json->\"$.withdraw_bolt11_paid\")) LIMIT 1;", [req.params.id]);
  if (rows.length === 0) {
    req.log("paid request not found");
    await mysql.getPoolConnection().execute("select RELEASE_LOCK(?) as result;", [lockName]);
    return res.send({"error": "paid request not found"});
  }
  const Send =  <Send>rows[0].json;

  const p = new Paym(lightning);
  const decoded = await p.decodePayReqViaRpc(req.params.invoice);
  if (!decoded.num_satoshis || +decoded.num_satoshis !== Send.satoshis) {
    req.log("amounts do not match");
    await mysql.getPoolConnection().execute("select RELEASE_LOCK(?) as result;", [lockName]);
    return res.send({error: "amounts do not match"});
  }

  req.log("trying to send amount satoshis: " + decoded.num_satoshis);

  let result;
  try {
    await mysql.getPoolConnection().execute("update Send set json = JSON_SET(json, \"$.withdraw_bolt11_paid\", true) where id = ? LIMIT 1", [req.params.id]);
    await mysql.getPoolConnection().execute("update Send set json = JSON_SET(json, \"$.withdraw_bolt11\", ?) where id = ? LIMIT 1", [req.params.invoice, req.params.id]);
    result = await p.sendPaymen(req.params.invoice);
    if (result.payment_error) {
      await mysql.getPoolConnection().execute("update Send set json = JSON_SET(json, \"$.withdraw_bolt11_paid\", false) where id = ? LIMIT 1", [req.params.id]);
    }
    await mysql.getPoolConnection().execute("update Send set json = JSON_SET(json, \"$.withdraw_result\", ?) where id = ? LIMIT 1", [JSON.stringify(result), req.params.id]);
  } catch (Err) {
    req.log("error: " + Err);
    await mysql.getPoolConnection().execute("select RELEASE_LOCK(?) as result;", [lockName]);
    return res.send({error: Err});
  }

  req.log("success: " + JSON.stringify(result));
  await mysql.getPoolConnection().execute("select RELEASE_LOCK(?) as result;", [lockName]);
  res.send(result);
};

export let lookupInvoice = async (req: MyRequest, res: Response) => {
  req.assert("invoice", "invoice cannot be blank").notEmpty();
  const errors = req.validationErrors();
  if (errors) {
    req.flash("errors", errors);
    return res.redirect("/");
  }

  req.log("looking up invoice");

  const p = new Paym(lightning);
  let invoice;
  try {
    invoice = await p.lookupInvoice(req.params.invoice);
    if (invoice.settled) {
      req.log("invoice is settled");
      const [rows, fields] = await mysql.getPoolConnection().execute("select id, json->\"$.refill_bolt11_paid\" as refill_bolt11_paid, json->\"$.phone\" as phone FROM  Send WHERE json->\"$.refill_bolt11\"  = ? HAVING  refill_bolt11_paid = false LIMIT 1", [req.params.invoice]);
      for (const row of rows) {
        req.log("found Send id " + row.id + " and marking it as refill_bolt11_paid=true");
        await mysql.getPoolConnection().execute("update Send set json = JSON_SET(json, \"$.refill_bolt11_paid\", true) where id = ? LIMIT 1", [row.id]);

        client.messages
            .create({
              body: "A friend sent you some satoshis! Claim them here: " + "https://" + req.get("host") + "/" + row.id,
              from: getFromPhone(row.phone),
              to: row.phone
            })
            .then(message => req.log("Sent SMS: " + message.sid + " tel: " + row.phone))
            .catch(message => req.log("SMS error: " + message + " tel: " + row.phone))
        ;
      }
    }
  } catch (Err) {
    req.log("error: " + Err);
    return res.send({error: Err});
  }

  res.send(invoice);
};

export let generateQr = async (req: MyRequest, res: Response) => {
  req.assert("text", "invoice cannot be blank").notEmpty();
  const errors = req.validationErrors();
  if (errors) {
    req.flash("errors", errors);
    return res.redirect("/");
  }

  let filename;
  let qrSvg;
  filename = "dist/public/qr/" + crypto.createHash("sha1").update(decodeURIComponent(req.params.text)).digest("hex") + ".png";
  qrSvg = qr.image(decodeURIComponent(req.params.text), { type: "png" });
  qrSvg.pipe(fs.createWriteStream(filename));
  qrSvg.on("end", function () {
    res.redirect(301, "/" + filename.replace("dist/public/", ""));
    res.end();
  });
  qrSvg.on("error", function () {
    res.send("QR file error");
    res.end();
  });
};

/**
 * GET /
 * Home page.
 */
export let index = (req: Request, res: Response) => {
  res.render("home", {
    title: "Home"
  });
};


function getFromPhone(to) {
  if (to.toString().replace("+", "").startsWith("1")) {
    return "+12563776112";
  } else {
    return "+447588662249";
  }
}

async function validatePhoneNumber(phoneNumber) {
  return new Promise(async (resolve) => {
    try {
      const number = await client.lookups.phoneNumbers(phoneNumber).fetch();
      console.log(number);
      resolve(number.phoneNumber);
    } catch (_) {
      resolve(false);
    }
  });
}