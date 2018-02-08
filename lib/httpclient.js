/**
 * httpclient.js
 */

const util = require("util");
const http = require("http");

exports.httpGet = httpGet;

function httpGet({ host, port, url, adr, stopOnError }, logger, callback) {
  logger.log("", "client");
  httpClientLog("=>", host, "HTTP GET " + url);

  const req = http
    .get({ host: host, port: port, path: url, agent: false }, res => {
      httpClientLog("<=", host, resStatus(res));

      let body = "";
      if (res.statusCode != 200) {
        res.resume();
        return;
      }

      res.on("data", function(chunk) {
        body += chunk;
      });

      res.on("end", function() {
        logger.log(" body: " + String(body), "client");
        if (callback) callback(body);
      });
    })
    .on("error", function(e) {
      errorhandler(e);
    });

  req.on("socket", function(socket) {
    socket.setTimeout(30000);
    socket.on("timeout", function() {
      httpClientLog("<=>", host, "Socket timed out - abort!");
      req.abort();
    });

    socket.on("close", function() {
      logger.log("localhost <=>" + host + " socket closed", "socket");
    });
  });

  function errorhandler(e) {
    let mess = "Error " + e.code + ". ";
    let result = 3;

    if (e.code == "ECONNREFUSED") {
      mess += " Connection error. ";
      result = 2;
    }
    if (stopOnError) {
      httpClientLog("<=", host, mess + " Stopped.");
      process.exit(result);
    } else {
      httpClientLog("<=", host, mess);
    }
  }

  function resStatus(res) {
    let mess =
      res.statusCode == 200
        ? " contentType = " + res.headers["content-type"]
        : "";
    return " response: statusCode=" + res.statusCode + mess;
  }

  function httpClientLog(dir, host, msg) {
    logger.log("localhost " + dir + " " + host + " " + msg, "client");
  }
}
