/**
 * megad.js
 * Имя плагина - megad, манифест - megad.json
 */

const util = require("util");
const http = require("http");
const url = require("url");
const qr = require("querystring");

const prepare = require("./lib/prepare");
const ut = require("./lib/utils");

// id плагина  - megadx
const unitId = process.argv[2];

// Параметры логирования
const logsection = { start: 1, client: 1, server: 1, command: 1, socket: 0 };

// Значения параметров плагина, которые прописаны в разделе params манифеста
// Здесь можно установить дефолтные значения
const unitParams = {
  host: "127.0.0.1",
  port: 80,
  lport: 8081,
  pwd: "sec",
  allreq: "/%pwd%/?cmd=all",
  allreqsek: 0
};

var tableMReq; // Таблица входящих запросов
var reqarr; // Массив исходящих запросов
var timers = []; // Таймеры для исходящих http запросов
var counters = {}; // Обработка, связанная с длинными нажатиями???

let outReqInFetch = 0; // Состояние связи
let step = 0; // Состояния плагина

traceMsg("", "start");
traceMsg("MegaD plugin has started.", "start");
next();

function next() {
  switch (step) {
    case 0:
      // Запрос на получение параметров
      getTable("params");
      step = 1;
      break;

    case 1:
      if (unitParams.lport) {
        // Запрос на получение списка входящих запросов
        getTable("extra");
        // Запуск слушающего сервера.
        startListeningServer();
      }
      step = 2;
      break;

    case 2:
      // Запрос на получение каналов для опроса
      getTable("config");
      step = 3;
      break;

    case 3:
      // Запуск Основного цикла опроса
      setInterval(runOutReq, 200);
      step = 4;
      break;

    default:
  }
}

function getTable(name) {
  process.send({ type: "get", tablename: name + "/" + unitId });
}

function startListeningServer() {
  http
    .createServer(onRequest)
    .listen(unitParams.lport)
    .on("error", e => {
      let msg =
        e.code == "EADDRINUSE" ? "Address in use" : +e.code + " Stopped.";
      traceMsg(
        `HTTP server port: ${unitParams.lport} error ${e.errno}. ${msg}`
      );
      process.exit(1);
    });
  traceMsg("Listening localhost:" + unitParams.lport, "start");
}

/**
 *  Интервальная функция выполняет запросы по массиву timers.
 *   timers упорядочен по .qtime
 *   В каждом цикле проверяется только первый элемент
 **/
function runOutReq() {
  if (outReqInFetch) {
    //traceMsg('Socket IN FETCH.');
    return;
  }

  if (timers.length > 0) {
    let curtime = new Date().getTime();
    if (timers[0].qtime <= curtime) {
      var item = timers.shift();
      resetTimer(item, curtime);
      nextHttpGet(reqarr[item.index].url, reqarr[item.index].adr);
    }
  }
}

/** Формирование таймеров с нуля **/
function formTimers() {
  let curtime = new Date().getTime();

  timers = [];
  for (var i = 0; i < reqarr.length; i++) {
    if (i == 0) {
      timers.push({ index: i, qtime: curtime });
    } else {
      // нужно вставить с учетом сортировки, чтобы время было через интервал сразу
      resetTimer({ index: i, qtime: 0 }, curtime);
    }
  }
}

/** Включить запрос в массив таймеров снова, если есть интервал опроса 	**/
function resetTimer(item, curtime) {
  let i;

  if (item && item.index < reqarr.length && reqarr[item.index].tick > 0) {
    item.qtime = curtime + reqarr[item.index].tick * 1000;
    i = 0;
    while (i < timers.length) {
      if (timers[i].qtime > item.qtime) {
        timers.splice(i, 0, item);
        return;
      }
      i++;
    }
    timers.push(item);
  }
}

/** Заменить запрос в массиве таймеров - поменяли интервал опроса 	**/
function replaceTimer(adr, reqsek) {
  let index;

  index = getIndexForAdrInReqarr(adr); // Найти index для адреса adr
  if (index == undefined) return;

  // заменить интервал в reqarr, если изменили
  if (reqarr[index].tick == reqsek) return;

  reqarr[index].tick = reqsek;

  // Удалить старый таймер и заменить на новый
  deleteTimer(index);
  resetTimer({ index: index, qtime: reqsek }, new Date().getTime());
  traceMsg("Address " + adr + ". Shift request interval: " + reqsek + " sek.");
}

function deleteTimer(index) {
  for (var i = timers.length - 1; i >= 0; i--) {
    if (timers[i].index == index) {
      timers.splice(i, 1);
      return;
    }
  }
  console.log("deleteTimer: not found item index=" + index + " in timers");
}

function getIndexForAdrInReqarr(adr) {
  for (var i = 0; i < reqarr.length; i++) {
    if (reqarr[i].adr == adr) {
      return i;
    }
  }
}

/*********************************************** Обработка входящих http-запросов. *********************************/

function onRequest(request, response) {
  let ip = ut.getHttpReqClientIP(request);
  httpServerLog(ip, "=>", "HTTP GET " + request.url);

  let qobj = url.parse(request.url, true).query;

  // Системный запрос st=1 - сформировать список таймеров с нуля
  if (qobj.st == 1) {
    formTimers();
  }

  let mreqobj = findMReq(url.parse(request.url).pathname, qobj);
  let answer = "";

  // Если такой запрос не предусмотрен - но ответить надо?? Или можно не отвечать??
  if (mreqobj) {
    answer = mreqobj.response || "";

    // Состояния каналов - установить, передать наверх
    processSendData(setStates(mreqobj.state, qobj));
  }

  // Ответ на запрос, возможно, пустой
  httpServerLog(ip, "<=", answer);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(answer);
  response.on("error", e => {
    httpServerLog(ip, "<=", " ERROR:" + e.code);
  });
}

function httpServerLog(ip, dir, msg) {
  traceMsg(`${ip} ${dir} localhost:${unitParams.lport} ${msg}`, "server");
}


/** Найти запрос в таблице запросов - получить объект: {num:3, q=1, repsonse:'7:2', queryprops:{m:1}, state:'', props:[]} 	
*
**/
function findMReq(pathname, query) {
  let id;

  if (tableMReq && pathname && query && tableMReq[pathname]) {
    id = query.pt != undefined ? query.pt : "U";
    if (tableMReq[pathname][id] && util.isArray(tableMReq[pathname][id])) {
      for (var i = 0; i < tableMReq[pathname][id].length; i++) {
        if (isSuitable(tableMReq[pathname][id][i].queryprops, query))
          return tableMReq[pathname][id][i];
      }
    }
  }
}

function isSuitable(patobj, qobj) {
  if (!patobj || !qobj) return;

  for (var prop in patobj) {
    if (patobj[prop] == "*") {
      if (qobj[prop] == undefined) return;
    } else {
      if (qobj[prop] != patobj[prop]) return;
    }
  }
  return true;
}

/** Установить значения состояния 	**/

function setStates(ststr, qobj, redirectunit) {
  var sarr,
    xunit,
    result = "";

  if (!ststr) return;

  // 2=ON&3=OFF&4=*&5=%v%
  sarr = ststr.split("&");

  if (!sarr || !util.isArray(sarr)) return;

  for (var i = 0; i < sarr.length; i++) {
    if (sarr[i]) {
      result = result + formOneState(sarr[i]);
    }
  }

  // Предварительно их надо обработать, возможно, они зависят от входящих значений!! 7=%val%
  // Или от предыдущего состояния - например, 7:2 - это toggle? - это уже должен делать procMGD???
  //  Результат - строка adr=val&
  return result;

  function formOneState(str) {
    var arr,
      num,
      val,
      res = "";
    if (str) {
      arr = str.split("=");
      num = Number(arr[0]);
      if (num != undefined && arr[1]) {
        val = formVal(arr[1]);
        if (val == "CNT") {
          if (skipCntVal()) return "";
        }

        res = String(num) + "=" + String(val) + "&";
      }
    }
    return res;
  }

  // М.б. сообщение при длинном нажатии - берем параметр cnt
  function skipCntVal(num) {
    if (counters[num] && counters[num] == qobj.cnt) return true;
    counters[num] = qobj.cnt;
  }

  function formVal(v) {
    var aname;
    if (v.substr(0, 2) == "ON") return 1;
    if (v.substr(0, 2) == "OF") return 0;

    if (v.substr(0, 1) == "%") {
      aname = v.substr(1, v.length - 2);
      if (qobj && aname && qobj[aname] != undefined) {
        return qobj[aname];
      }
    }
    // Любое другое значение - просто отдать
    return v;
  }
}

/** Клиент http - опрашивает по таймерам
 *  cmd=all =>  ON;ON/0;OFF/5;OFF;254;15.5;temp:23.5/hum:40;200
 *  pt=1&cmd=get => 15.5
 **/
function nextHttpGet(url, adr) {
  const host = unitParams.host;
  const port = Number(unitParams.port) || 80;

  traceMsg("", "client");
  httpClientLog("=>", unitParams.host, "HTTP GET " + url);
  outReqInFetch = 1;

  const req = http
    .get({ host: host, port: port, path: url, agent: false }, res => {
      httpClientLog("<=", unitParams.host, resStatus(res));

      let body = "";
      if (res.statusCode != 200) {
        res.resume();
        setConnectionEnding();
        return;
      }

      res.on("data", function(chunk) {
        body += chunk;
      });

      res.on("end", function() {
        setConnectionEnding();
        traceMsg(" body: " + String(body), "client");
        processSendData(
          ut.parse(String(body), url, adr ? ut.portNumber(adr) : "")
        );
      });
    })
    .on("error", function(e) {
      errorhandler(e);
      // По этой ошибке сразу выходим, можно не сбрасывать
      setConnectionEnding();
    });

  req.on("socket", function(socket) {
    socket.setTimeout(30000);
    socket.on("timeout", function() {
      httpClientLog("<=>", unitParams.host, "Socket timed out - abort!");
      req.abort();
      setConnectionEnding();
    });

    socket.on("close", function() {
      traceMsg("localhost <=>" + host + " socket closed", "socket");
    });
  });
}

function setConnectionEnding() {
  outReqInFetch = 0;
}

function errorhandler(e) {
  let mess = "Error " + e.code + ". ";
  let result = 3;

  if (e.code == "ECONNREFUSED") {
    mess += " Connection error. ";
    result = 2;
  }
  httpClientLog( "<=", unitParams.host, mess + " Stopped.");
  process.exit(result);
}

function processSendData(payload) {
  if (!payload) return;

  let data;
  if (util.isArray(payload)) {
    data = payload;
  } else if (typeof payload == "string") {
    // Получаем строку adr=val&adr=val&...
    let robj = qr.parse(payload);
    // Преобразуем {adr:val, ..} => [{id:'1', value:'1'}]
    if (robj) {
      data = Object.keys(robj).map(adr => ({ id: adr, value: robj[adr] }));
    }
  }
  if (!data) return;
  traceMsg("send " + util.inspect(data));
  process.send({ type: "data", data });
}

/**  Передать команду	- возможно, на другую мегу  **/

function sendHttpGet(auobj, amessage) {
  amessage = ut.doSubstitute(amessage, { pwd: auobj.pwd });

  httpClientLog("=>", auobj.host + ":" + auobj.port, "HTTP GET " + amessage);

  http
    .get(
      { host: auobj.host, port: auobj.port, path: amessage, agent: false },
      res => {
        let body = "";
        httpClientLog("<=", auobj.host + ":" + auobj.port, resStatus(res));

        res.on("data", function(chunk) {
          body += chunk;
        });

        res.on("end", function() {
          httpClientLog("<=", auobj.host + ":" + auobj.port, " HTTP " + body);
        });
      }
    )
    .on("error", function(e) {
      httpClientLog("<=", auobj.host + ":" + auobj.port, " Error: " + e.code);
    });
}

function httpClientLog(dir, host, msg) {
  traceMsg("localhost " + dir + " " + host + " " + msg, "client");
}

function resStatus(res) {
  return (
    "response: statusCode=" +
    res.statusCode +
    " contentType = " +
    res.headers["content-type"]
  );
}

/******************************** Входящие от IH ****************************************************/
process.on("message", function(message) {
  if (!message) return;

  if (typeof message == "string") {
    if (message == "SIGTERM") {
      traceMsg("Stopped by server SIGTERM.");
      process.exit(0);
    }
  }

  if (typeof message == "object") {
    try {
      if (message.type) parseMessageFromServer(message);
    } catch (e) {
      traceMsg(e.message);
    }
  }
});

function parseMessageFromServer(message) {
  switch (message.type) {
    case "get":
      if (message.params) paramResponse(message.params);
      if (message.config) configResponse(message.config);
      if (message.extra) extraResponse(message.extra);
      break;

    case "act":
      doAct(message.data);
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
      let message = "/%pwd%/?cmd=" + item.id + ":" + value;
      sendHttpGet(unitParams, message);
      // и на сервер передать что сделали
      processSendData([{ id: item.id, value }]);
    }
  });
}

// Сервер прислал параметры - взять которые нужны
function paramResponse(params) {
  if (typeof params == "object") {
    Object.keys(params).forEach(param => {
      if (unitParams[param] != undefined) unitParams[param] = params[param];
    });
  }
  next();
}

// Сервер прислал каналы - сформировать свои структуры
function configResponse(config) {
  if (typeof config == "object") {
    if (!util.isArray(config)) config = [config];

    // Сформировать массив исходящих запросов reqarr
    reqarr = prepare.prepareOutReq(unitParams, config);

    // Подготовить массив таймеров для исходящих запросов
    formTimers();
  }
  next();
}

// Сервер прислал список входящих запросов от контроллера
function extraResponse(extra) {
  tableMReq = prepare.formTableMReq(extra);
  next();
}

process.on("uncaughtException", function(err) {
  var str = "ERR (uncaughtException): " + util.inspect(err);
  traceMsg(str);
});

function traceMsg(text, section) {
  if (!section || logsection[section]) {
    process.send({ type: "log", txt: text });
    console.log(text);
  }
}
