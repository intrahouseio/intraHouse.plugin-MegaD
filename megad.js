/**
 * megad.js
 * Имя плагина - megad, манифест - megad.json
 */

const util = require("util");

const ut = require("./lib/utils");
const httpserver = require("./lib/httpserver");
const httpclient = require("./lib/httpclient");

const logger = require("./lib/logger");

const plugin = require("./lib/plugin");

let step = 0;
plugin.unitId = process.argv[2];

logger.log("MegaD plugin has started.", "start");
next();

function next() {
  switch (step) {
    case 0:
      // logger.log('step='+step, "start");
      // Запрос на получение параметров
      getTable("params");
      step = 1;

      break;

    case 1:
      // Запрос на получение списка входящих запросов
      getTable("extra");
      step = 2;
      break;

    case 2:
      // Запрос на получение каналов для опроса
      getTable("config");
      step = 3;
      break;

    case 3:
      // Запуск слушающего сервера.
      httpserver.start(plugin, logger);

      // Запуск Основного цикла опроса
      setInterval(runOutReq, (plugin.params.qTimeout>0) ? plugin.params.qTimeout : 200);
      step = 4;
      break;

    default:
  }
}

function getTable(name) {
  // process.send({ type: "get", tablename: name + "/" + plugin.unitId });
  process.send({ type: "get", tablename: name });
}

/**
 *  Интервальная функция выполняет запросы по массиву timers.
 *   timers упорядочен по .qtime
 *   В каждом цикле проверяется только первый элемент
 **/
function runOutReq() {
  let req = plugin.getNextReq();
 
  if (req) {
    httpclient.httpGet(req, logger, body => {
      body = String(body);
      if (body.indexOf("busy") >= 0) {
        plugin.resetTimer(req.index, 2); // Повторить через 2 сек
      } else {
        let payload;
        if (req.passBack) {
          // была отправлена команда - если получили 200 - можно установить значение
          if (req.passBack.raw) {
       
            process.send({ type: "command", uuid:req.passBack.uuid, payload:body, response:1 });
          } else payload = req.passBack;
        } else {
          // опрос
          payload = ut.parse(
            body,
            req.url,
            req.adr ? ut.portNumber(req.adr) : "",
            plugin.prefun,
            req.adr
          );
        }

        if (req.index >= 0) plugin.resetTimer(req.index);
        if (payload) plugin.processSendData(payload);
      }
    });
  }
}


/** ****************************** Входящие от IH ************************************/
process.on("message", message => {
  if (!message) return;

  if (typeof message == "string") {
    if (message == "SIGTERM") process.exit(0);
  }

  if (typeof message == "object") {
    try {
      if (message.type) parseMessageFromServer(message);
    } catch (e) {
      logger.log(e.message);
    }
  }
});

function parseMessageFromServer(message) {
  switch (message.type) {
    case "get":
      if (message.params) {
        plugin.setParams(message.params);
        if (message.params.debug) logger.setDebug(message.params.debug);
      }
      if (message.config) plugin.setConfig(message.config);
      if (message.extra) plugin.setExtra(message.extra);
      next();
      break;

    case "act":
      doAct(message.data);
      break;

    case "command":
      doCommand(message);
      break;

    case "debug":
      if (message.mode) logger.setDebug(message.mode);
      break;

    default:
  }
}

function doCommand(message) {
  logger.log("command: " + util.inspect(message.command));
  if (!message.command) return;

  let command = message.command;

  let url;
  let passBack;
  if (typeof command == "string") {
    url = command;
  } else if (command.url) {
    url = command.url;

    if (command.onResponse) {
      if (command.onResponse == "raw") {
        passBack = {raw:true, uuid:message.uuid, url, type:'command'};

      } else if (typeof command.onResponse == "object") {
        passBack = util.isArray(command.onResponse)
          ? command.onResponse
          : [command.onResponse];
      } else logger.log("command.onResponse - expected object! Skipped");
    }
  }

  if (!url) {
    logger.log("ERROR message with type:command. expected url!");
    return;
  }
  url = ut.doSubstitute(url, {pwd: plugin.params.pwd});
  plugin.addActReq(url, passBack);
}

// data = [{id:adr, command:on/off/set, value:1}]
function doAct(data) {
  if (!data || !util.isArray(data) || data.length <= 0) return;

  // logger.log("act: " + util.inspect(data));
  data.forEach(item => {
    plugin.addAct(item);
  });
}

process.on("uncaughtException", err => {
  var text = "ERR (uncaughtException): " + util.inspect(err);
  logger.log(text);
});

process.on("disconnect", () => {
  process.exit();
});
