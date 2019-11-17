import express from "express";
import compression from "compression";  // compresses requests
import session from "express-session";
import bodyParser from "body-parser";
import logger from "./util/logger";
import lusca from "lusca";
import dotenv from "dotenv";
import flash from "express-flash";
import path from "path";
import expressValidator from "express-validator";
import { SESSION_SECRET } from "./util/secrets";
const nanoid = require("nanoid");

// Load environment variables from .env file, where API keys and passwords are configured
dotenv.config({ path: ".env.example" });
require("./util/mysql"); // warm up mysql connection asap

import * as mainController from "./controllers/main";
import { MyRequest } from "./models/myRequest";

const app = express();
app.set("port", process.env.PORT || 54710);
app.set("views", path.join(__dirname, "../views"));
app.engine("mustache", require("mustache-express")());
app.set("view engine", "mustache");
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: SESSION_SECRET
}));
app.use(flash());
app.use(lusca.xframe("SAMEORIGIN"));
app.use(lusca.xssProtection(true));
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

app.set("trust proxy", 1);

const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});
app.use(limiter);

app.use(function (req: MyRequest, res, next) {
  req.id = nanoid(32);
  req.log = function(message) {
    logger.info([
        req.id,
        req.method + " " + req.originalUrl,
        new Date().toISOString(),
        message
    ].join("\t"));
  };
  if ("/favicon.ico" === req.originalUrl) return next();
  req.log("");
  next();
});


app.use(
  express.static(path.join(__dirname, "public"), { maxAge: 31557600000 })
);

/**
 * Primary app routes.
 */
app.get("/", mainController.index);
app.get("/generate_qr/:text", mainController.generateQr);
app.get("/send/:tel/:sat", mainController.createSend);
app.post("/send/:tel/:sat", mainController.createSend);
app.get("/:id", mainController.getSend);
app.get("/lookupinvoice/:invoice", mainController.lookupInvoice);
app.get("/payinvoice/:invoice/:id", mainController.payInvoice);




export default app;