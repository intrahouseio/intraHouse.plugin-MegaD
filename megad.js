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

// id плагина  - megad1
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
next();

function next() {
  switch (step) {
    case 0: // Запрос на получение параметров
      getTable("params");
      step = 1;
      break;

    case 1: // Запрос на получение каналов
      getTable("config");
      step = 2;
      break;

    case 2:
      // Запуск Основного цикла опроса http-клиента
      setInterval( runOutReq, 200);
      step = 3;
      break;

    default:
  }
}

function getTable(name) {
  process.send({ type: "get", tablename: name + "/" + unitId });
}

/*

	try {
		if (!unit || !basepath)    throw { message:'Missing plugin parameters!!'};
		
		// Получить список всех Мег, чтобы перенаправлять запрос: {MG2:{}, MG3:{}}
		megas = hut.getObjFromArray( ihdb.findObjInFile( jbasepath+'/units.json' , {unitkind:'MGD' }, true ), 'num');

		if (!megas)     throw { message:'Not found units with unitkind=MGD!'};
		
		// Выбрать основную Meгу:uobj 
		uobj = megas[unit];
		if (!uobj)      throw { message:'Not found unit:'+unit};
		if (!uobj.host) throw { message:'Missing IP-address'};
		host = uobj.host+ ((uobj.port) ? (':'+uobj.port) : '');

		// Логгирование в целях отладки
		if (uobj.log) {
			plogger = new plainlogger.Logger({path:basepath, name:unit, sizekb:256, count:5 });
		}	
		
		traceMsg('', 'start');			
		traceMsg('MegaD plugin has started.', 'start');			
		
		// Http сервер. Если есть порт, который надо слушать - запустить 
		if (uobj.lport) {
			tableMReq = formTableMReq();
			server = http.createServer(onRequest).listen(uobj.lport); 
			server.on('error', function(e) {
				traceMsg('HTTP server port:'+ uobj.lport+' error '+e.errno+'. '+((e.code == 'EADDRINUSE')?('Address in use'):+e.code+' Stopped.'));
				process.exit(1);
			});
			traceMsg('Listening localhost:'+uobj.lport, 'start');		
		}

		
	} catch (e) {	
		traceMsg( e.message+' Stopped.');
		process.exit(1);
	}
	
*/
/**
 *  Интервальная функция выполняет запросы по массиву timers.
 *   timers упорядочен по .qtime
 *   В каждом цикле проверяется только первый элемент
 **/

function runOutReq() {
  var curtime;

  if (outReqInFetch) {
    //traceMsg('Socket IN FETCH.');
    return;
  }

  if (timers.length > 0) {
    curtime = new Date().getTime();
    if (timers[0].qtime <= curtime) {
      try {
        var item = timers.shift();
        resetTimer(item, curtime);
        nextHttpGet(reqarr[item.index].url, reqarr[item.index].adr);
      } catch (e) {
        traceMsg(
          "Exception: " +
            e.message +
            ". get-function for " +
            reqarr[item.index].url
        );
      }
    }
  }
}

/** Формирование таймеров с нуля **/
function formTimers() {
    var curtime = new Date().getTime();
  
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
  var i;

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
  var index;

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
  console.log("getIndexForAdrInReqarr: not found adr=" + adr + " in reqarr");
}

/*********************************************** Обработка входящих http-запросов. *********************************/
/*
  function onRequest(request, response) {
	var mreqobj, answer='', ip='', qobj;
		
		ip = hut.getHttpReqClientIP(request);
		traceMsg( ip+' => localhost:'+uobj.lport+' HTTP GET '+request.url , 'server');		
		
		//answer = processMReq(request.url);
		qobj = url.parse(request.url, true).query;
		// Системный запрос st=1
		if (qobj.st == 1) {
			formTimers();
		} 
		
		mreqobj = findMReq(url.parse(request.url).pathname, qobj);
		
		// Если такой запрос не предусмотрен - но ответить надо?? Или можно не отвечать??
		if ( mreqobj) {
			setStates( mreqobj.state, qobj );	
			answer = mreqobj.response || '';
		}	
		
		// Ответ на запрос, возможно, пустой
		traceMsg( ip+' <= localhost:'+uobj.lport+' ' + answer, 'server');		
		response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
		response.end(answer);
		response.on('error', function(e) {
			traceMsg( ip+' <= localhost:'+uobj.lport+' ERROR:' + e.code, 'server');		
		});
		
		// Обработать redirect на другие контроллеры
		if ( mreqobj && mreqobj.props ) {
			for (var i=0; i<mreqobj.props.length; i++) {
				if (sendOtherReq(mreqobj.props[i])) {
					// И устройства установить для другой Megи
					if (mreqobj.props[i].state) setStates(mreqobj.props[i].state, qobj, mreqobj.props[i].unit );	
				}
			}
		}	
	}	

	*/
/** Найти запрос в таблице запросов - получить объект: {num:3, q=1, repsonse:'7:2', queryprops:{m:1}, state:'', props:[]} 	**/
/*
	function sendOtherReq( sobj) {
		if (!sobj) return;
		try {
			if (!sobj.unit) throw {message:'Empty "unit" property for redirect.'};
			if (!sobj.req)  throw {message:'Empty "request" property for redirect.'};
			if (!megas[sobj.unit] ) throw {message:'Not found unit '+sobj.unit+' for redirect.'};
				
			traceMsg('Redirect to '+sobj.unit, 'server');
			sendHttpGet( megas[sobj.unit], sobj.req);
			return true;
			
		} catch (e) {
			traceMsg('Not found unit '+sobj.unit+' for redirect.');
		}
	}
	*/

/** Поиск по таблице запросов **/
/*
  function findMReq(pathname, query) {
	var fobj, id;
		
		if (pathname && query && tableMReq[pathname]) {
		
			id = (query.pt != undefined) ? query.pt : 'U';
			if (tableMReq[pathname][id] && util.isArray(tableMReq[pathname][id])) {
		
				for (var i=0; i<tableMReq[pathname][id].length; i++) {
					if (isSuitable(tableMReq[pathname][id][i].queryprops, query))  return tableMReq[pathname][id][i];
				}
			}
		}
	}
	
	
	function isSuitable(patobj, qobj) {
		if (!patobj || !qobj) return;
		
		for (var prop in patobj) {
			if (patobj[prop] == '*') {
				if (qobj[prop] == undefined) return; 
			} else {
				if (qobj[prop] != patobj[prop]) return;
			}	
		}
		return true;
	}
*/

/** Установить значения состояния 	**/
/*
  function setStates(ststr, qobj, redirectunit) {
	var sarr, xunit, result='';
		
		if (!ststr) return;
		
		// 2=ON&3=OFF&4=*&5=%v%
		sarr = ststr.split('&');
		
		if (!sarr || !util.isArray(sarr)) return;
			
		for (var i=0; i<sarr.length; i++) {
			if (sarr[i]) {
				result = result + formOneState(sarr[i]);
			}	
		}
		
		// Предварительно их надо обработать, возможно, они зависят от входящих значений!! 7=%val%
		// Или от предыдущего состояния - например, 7:2 - это toggle? - это уже должен делать procMGD???
		xunit = (redirectunit) ? redirectunit : unit;
		traceMsg(xunit+'?'+result, 'server');
		process.send(xunit+'?'+result);
	
	
		function formOneState( str ) {
		var arr, num, val, res='';
			if (str) {
				arr = str.split('=');
				num = Number(arr[0]);
				if ((num != undefined) && (arr[1])) {

					val = formVal(arr[1]);
					if (val == 'CNT') {
						if (skipCntVal()) return '';
					}
					
					res = String(num)+'='+String(val)+'&';
				}
			}
			return res;
		}
		
		
		// М.б. сообщение при длинном нажатии - берем параметр cnt
		function skipCntVal( num ) {
			if ( counters[num] && (counters[num] == qobj.cnt) ) return true; 
			counters[num] = qobj.cnt;
		}
		
		function formVal( v ) {
		var aname;
			if (v.substr(0,2) == 'ON') return 1; 
			if (v.substr(0,2) == 'OF') return 0; 
			
			if (v.substr(0,1) == '%') {
				aname = v.substr(1, v.length-2);
				if (qobj && aname && (qobj[aname] != undefined)) {
					return 	qobj[aname];
				}	
			}
			// Любое другое значение - просто отдать
			return v;
		}
	}
	*/

function nextHttpGet(url, adr) {
  const host = unitParams.host;
  const port = Number(unitParams.port) || 80;

  traceMsg("", "client");
  httpClientLog("=>", "HTTP GET " + url);
  outReqInFetch = 1;

  const req = http
    .get({ host: host, port: port, path: url, agent: false }, function(res) {
      let body = "";
      httpClientLog(
        "<=",
        "statusCode=" +
          res.statusCode +
          " contentType=" +
          res.headers["content-type"]
      );

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
        traceMsg(" body: " + String(body));
        datahandler(body, url, adr ? ut.portNumber(adr) : "");
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
      httpClientLog("<=>", "Socket timed out - abort!");
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
  let mess = "";
  let result = 3;

  if (e.code == "ECONNREFUSED") {
    mess = "Connection error";
    result = 2;
  }
  httpClientLog("<=", " Error " + e.code + ". " + mess + " Stopped.");
  process.exit(result);
}

function httpClientLog(dir, msg) {
  traceMsg("localhost " + dir + " " + unitParams.host + " " + msg, "client");
}


/********************************   Функции обработки Response  **********************************/

/**  cmd=all =>  ON;ON/0;OFF/5;OFF;254;15.5;temp:23.5/hum:40;200
 *    pt=1&cmd=get => 15.5
 **/

function datahandler(body, url, adr) {
  let str = ut.parse(body, url, adr);

  // Получаем строку adr=val&adr=val&...
  traceMsg(" parse: " + str);

  let robj = qr.parse(str);
  // Получаем объект {adr:val, ..} => [{id:'1', value:'1'}]
  let data = Object.keys(robj).map(adr => ({id:adr, value:robj[adr]}));

  // Результат в виде {type:data, data:[{id:'1_1', value:1}]}
  process.send({ type: "data", data });
}

/*********************   Подготовительные операции ******************************/

/** Формирование таблицы входящих запросов **/
/*
  function formTableMReq() {
	var id, tbl={}, index=-1, pathname;
	var filename = jbasepath+'/hreq'+unit+'.json';
	var reqarr;
		
		// Если файла запросов нет - создать строку для примера и сразу ее загрузить??
		if (fs.existsSync(filename)) {
			reqarr = hut.readFromFileSync( filename );
		} 

		if (!reqarr || !util.isArray(reqarr)) {
			reqarr = [{"num":"1","request":"/megad?pt=1","response":"7:0","state":"1=ON&7=OFF","name":""}];
			fs.writeFileSync(filename, JSON.stringify(reqarr) ,encoding='utf8');
		}	
		
		for (var i=0; i<reqarr.length; i++) {

			// сформировать объект
			onereq = getOneReqObj(reqarr[i]);
			if (!onereq) continue;
			
			// Найти место для вставки и вставить в таблицу
			pathname = onereq.pathname;

			if (!tbl[pathname]) tbl[pathname]={};
			
			id = (onereq.queryprops.pt != undefined) ? onereq.queryprops.pt : 'U';
			
			if (!tbl[pathname][id]) tbl[pathname][id]=[];
			
			index=-1;
			for (var j=0; j<tbl[pathname][id].length; j++) {
				if (tbl[pathname][id][j].q < onereq.q) {
					index = j;	
					break;
				}
			}
			
			if (index < 0) {
				tbl[pathname][id].push(onereq);
			} else {
				tbl[pathname][id].splice(j, 0, onereq);
			}			
		}
		return tbl;
		
		
		function getOneReqObj(item) {
		var oneobj;
		
			if (!item || !item.num || !item.request) return;

			oneobj = hut.clone(item);
			oneobj.pathname = url.parse(item.request).pathname;
			oneobj.queryprops    = url.parse(item.request, true).query;
			oneobj.q = hut.objPropCount(oneobj.queryprops);
			return oneobj;
		}
	}
*/



/** Загрузка массива исходящих запросов **/
/*
  function formChanReq(uobj) {
	var hdevarr;
	var filename = jbasepath+'/hdev'+unit+'.json';
	
		try {
			// Первый запрос - общий опрос
			if (uobj && uobj.allreq) {
				reqarr.push({url:uobj.allreq, tick:(uobj.allreqsek || 0)});
			}	

			if (!fs.existsSync(filename)) throw { message:'File not found '+filename };
		
			hdevarr = hut.readFromFileSync( filename );
		
			if (!hdevarr || !util.isArray(hdevarr))  throw { message:'Invalid data: '+filename };
			
			for (var i=0; i<hdevarr.length; i++) {
				if (hdevarr[i].props && util.isArray(hdevarr[i].props)) {
				
					for (var j=0; j<hdevarr[i].props.length; j++) {
						if ( hdevarr[i].props[j].r && hdevarr[i].props[j].req && (hdevarr[i].props[j].reqsek>0) ) {
							reqarr.push({url:hdevarr[i].props[j].req,  tick:hdevarr[i].props[j].reqsek, adr: String(hdevarr[i].devadr)});
						}
					}
				}
				
				if (hdevarr[i].usescript) {
					createFun(hdevarr[i].id, String(hdevarr[i].devadr));
				}
			}

		} catch (e) {
			traceMsg('ERROR: '+e.message);
		}
	}
  */

/** Создать функцию предобработки
 *   Считать из файла строку и создать функцию
 **/
/*
  function createFun(id, adr) {
	var funstr;
		
		funstr = getUscriptStr(id);
		traceMsg('Address '+adr+' ('+id+'). Loading script');
		try {
			if (!funstr) throw { message:'Script file missing or invalid!' };
			
			prefun[adr] = {depo:{}};
			prefun[adr].fun = new Function ('val, depo', funstr );
			
		} catch (e) {
			scriptError(e, adr);
		}
	}
	
	function scriptError(e, adr) {
		prefun[adr]='';
		traceMsg('Error: "'+e.message+'". Script disabled');
	}
	
	function getUscriptStr(id) {
	var filename, funstr, i,j;
	
		filename = scensource.getUscriptFileName( {link:'hdev'+unit, id:id} );
		if (!filename) return;
	
		filename = basepath + '/uscript' +'/'+ filename+'.js';
		if ( !fs.existsSync(filename) ) return;
		funstr =  fs.readFileSync(filename, encoding='utf8');
		if (!funstr)  return;
		
		// Взять только внутренность ф-и без {}
		i = funstr.indexOf('{');
		j = funstr.lastIndexOf('}');
		
		if ((i<=0) || (j<=0) || (i>j)) {
			traceMsg('Not found { } in script!');
			return;
		}
		return funstr.substring(i+1,j);
	}
  */

/**  Передать команду	- возможно, на другую мегу  **/
/*
  function sendHttpGet( auobj, amessage ) {
	var req;
	
		amessage = hut.doSubstitute( amessage, {login:auobj.login, pwd:auobj.pwd} );			

		traceMsg('localhost => '+auobj.host+':'+auobj.port+' HTTP GET '+amessage);

		req = http.get( {host:auobj.host, port:auobj.port, path:amessage, agent:false},  function(res) {
		var body = '';
			traceMsg('localhost <= '+auobj.host+':'+auobj.port+' response: statusCode='+ res.statusCode+' contentType = '+res.headers['content-type'], 'socket');
				
			res.on('data', function(chunk) {
				body += chunk;
			});

			res.on('end', function() {
				traceMsg('localhost <= '+auobj.host+':'+auobj.port+' HTTP '+ body, 'client');
			});
		}).on('error', function(e) {
			traceMsg('localhost <= '+auobj.host+':'+auobj.port+' Error: '+e.code);
		});
	}
	*/

/******************************** Входящие от backserver ****************************************************/

process.on("message", function(message) {
  if (!message) return;

  if (typeof message == "string") {
    if (message == "SIGTERM") {
      traceMsg("Stopped by server SIGTERM.");
      process.exit(0);
    }
    // sendHttpGet( uobj, message );
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
      break;

    case "act":
      doAct(message.data);
      break;
    default:
  }
}

function doAct(data) {
  if (!data || !util.isArray(data) || data.length <= 0) return;

  data.forEach(item => {
    // sendCommandToSocket(item);
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
  traceMsg("config=" + util.inspect(config));
  if (typeof config == "object") {
    if (!util.isArray(config)) config = [config];

    // Сформировать массив исходящих запросов reqarr
    reqarr = prepare.prepareOutReq(unitParams, config);
    // traceMsg("reqarr=" + util.inspect(reqarr));
    // Подготовить массив таймеров для исходящих запросов
    formTimers();
  }
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
