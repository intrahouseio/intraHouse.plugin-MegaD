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
      setInterval(runOutReq, 200);
      step = 4;
      break;

    default:
  }
}

function getTable(name) {
  process.send({ type: "get", tablename: name + "/" + plugin.unitId });
}

/**
 *  Интервальная функция выполняет запросы по массиву timers.
 *   timers упорядочен по .qtime
 *   В каждом цикле проверяется только первый элемент
 **/
function runOutReq() {
  let item = plugin.getNextReq();
  if (item) {
    let url = plugin.reqarr[item.index].url;
    let adr = plugin.reqarr[item.index].adr;

    httpclient.httpGet(
      {
        url,
        adr,
        host: plugin.params.host,
        port: plugin.params.port,
        stopOnError: true
      },
      logger,
      body => {
        plugin.processSendData(
          ut.parse(String(body), url, adr ? ut.portNumber(adr) : "")
        );
      }
    );
  }
}

/** ****************************** Входящие от IH ************************************/
process.on("message", (message) => {
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

    case "debug":
      if (message.mode) logger.setDebug(message.mode);
      break;

    default:
  }
}

// data = [{id:adr, command:on/off/set, value:1}]
function doAct(data) {
  if (!data || !util.isArray(data) || data.length <= 0) return;

  data.forEach(item => {
    if (item.id && item.command) {
      let value = item.command == "on" ? 1 : 0;

      httpclient.httpGet(
        {
          url: plugin.doCmd + item.id + ":" + value,
          host: plugin.params.host,
          port: plugin.params.port,
          stopOnError: false
        },
        logger
      );

      // и на сервер передать что сделали
      plugin.processSendData([{ id: item.id, value }]);
    }
  });
}

process.on("uncaughtException", (err) => {
  var text = "ERR (uncaughtException): " + util.inspect(err);
  logger.log(text);
});

process.on("disconnect", () => {
   process.exit();
});
