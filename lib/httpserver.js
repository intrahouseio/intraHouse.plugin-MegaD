/**
 * Слушающий http сервер
 * Обрабатывает запросы из таблицы extra
 */

const util = require("util");
const http = require("http");
const url = require("url");
// const qr = require("querystring");

// const prepare = require("./prepare");
const ut = require("./utils");
const httpclient = require("./httpclient");

exports.start = start;

function start(plugin, logger) {
  let port = plugin.params.lport;
  let tableMReq = formTableMReq(plugin.extra);

  logger.log("Listen server start", "server");
  http
    .createServer(onRequest)
    .listen(port)
    .on("error", e => {
      let msg =
        e.code == "EADDRINUSE" ? "Address in use" : `${e.code} Stopped.`;
      logger.log(`HTTP server port: ${port} error ${e.errno}. ${msg}`);
      process.exit(1);
    });

  logger.log("Listening localhost:" + port, "start");

  function onRequest(request, response) {
    let ip = ut.getHttpReqClientIP(request);
    httpServerLog(ip, "=>", "HTTP GET " + request.url);

    let qobj = url.parse(request.url, true).query;

    // Системный запрос st=1 - сформировать список таймеров для опроса с нуля, передать время, ...
    if (qobj.st == 1) plugin.onSt1();

    let mreqobj = findMReq(url.parse(request.url).pathname, qobj);
    let answer = "";

    // Если такой запрос не предусмотрен - но ответить надо?? Или можно не отвечать??
    if (mreqobj) {
      answer = mreqobj.response || "";

      // Состояния каналов - установить, передать наверх
      plugin.processSendData(plugin.setStates(mreqobj.state, qobj));
    }

    // Ответ на запрос, возможно, пустой
    httpServerLog(ip, "<=", answer);

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(answer);
    response.on("error", e => {
      httpServerLog(ip, "<=", " ERROR:" + e.code);
    });

    // возможность посылать полное сообщение, а не ответ на запрос
    if (mreqobj) {
      if (mreqobj.fullurl) sendFullUrl(mreqobj.fullurl);
      if (mreqobj.startscene) {
        logger.log(
          util.inspect({ type: "startscene", id: mreqobj.startscene }, "server")
        );
        process.send({ type: "startscene", id: mreqobj.startscene });
      }
    }
  }

  function sendFullUrl(fullUrl) {
    try {
      let furl = ut.doSubstitute(fullUrl, { pwd: plugin.params.pwd });
      httpclient.httpGet(
        {
          url: url.parse(furl).path,
          host: url.parse(furl).hostname || plugin.params.host,
          port: url.parse(furl).port || plugin.params.port,
          stopOnError: false
        },
        logger
      );
    } catch (e) {
      logger.log("Error sending request " + fullUrl + " : " + e.message);
    }
  }

  /** Найти запрос в таблице запросов - получить объект:
   * {num:3, q=1, repsonse:'7:2', queryprops:{m:1}, state:'', props:[]}
   *
   **/
  function findMReq(pathname, query) {
    let id;
    if (tableMReq && pathname && query && tableMReq[pathname]) {
      id = query.pt != undefined ? query.pt : "U";
      if (tableMReq[pathname][id] && util.isArray(tableMReq[pathname][id])) {
        for (var i = 0; i < tableMReq[pathname][id].length; i++) {
          if (isSuitable(tableMReq[pathname][id][i].queryprops, query)) {
            return tableMReq[pathname][id][i];
          }
        }
      }
    }
  }

  function isSuitable(patobj, qobj) {
    if (!patobj || !qobj) return;

    for (var prop in patobj) {
      if (patobj[prop] == "*") {
        if (qobj[prop] == undefined) return;
      } else if (qobj[prop] != patobj[prop]) return;
    }
    return true;
  }

  function httpServerLog(ip, dir, msg) {
    logger.log(`${ip} ${dir} localhost:${port} ${msg}`, "server");
  }

  /** Формирование таблицы входящих запросов
   *
   **/
  function formTableMReq(reqarr) {
    if (!reqarr || !util.isArray(reqarr)) return {};

    let id;
    let tbl = {};
    let index = -1;
    let pathname;

    for (var i = 0; i < reqarr.length; i++) {
      // сформировать объект
      let onereq = getOneReqObj(reqarr[i]);
      if (!onereq) continue;

      // Найти место для вставки и вставить в таблицу
      pathname = onereq.pathname;
      if (!tbl[pathname]) tbl[pathname] = {};

      // Сообщение по порту меги - pt=0 или общее
      id = onereq.queryprops.pt != undefined ? onereq.queryprops.pt : "U";

      if (!tbl[pathname][id]) tbl[pathname][id] = [];

      index = -1;
      for (var j = 0; j < tbl[pathname][id].length; j++) {
        if (tbl[pathname][id][j].q < onereq.q) {
          index = j;
          break;
        }
      }

      if (index < 0) {
        tbl[pathname][id].push(onereq);
      } else {
        tbl[pathname][id].splice(index, 0, onereq);
      }
    }
    return tbl;

    function getOneReqObj(item) {
      if (!item || !item.request) return;

      let oneobj = Object.assign({}, item);
      oneobj.pathname = url.parse(item.request).pathname;

      oneobj.queryprops = url.parse(item.request, true).query;

      oneobj.q =
        typeof oneobj.queryprops == "object"
          ? Object.keys(oneobj.queryprops).length
          : 0;
      return oneobj;
    }
  }
}
