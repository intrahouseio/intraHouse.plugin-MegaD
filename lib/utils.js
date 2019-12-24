/**
 * Утилиты
 */
const util = require('util');

exports.portNumber = portNumber;
exports.doSubstitute = doSubstitute;
exports.formOneState = formOneState;
exports.getHttpReqClientIP = getHttpReqClientIP;
exports.parse = parse;
exports.formCurrentTime = formCurrentTime;

/** Для исключения подканала из адреса: 16_1 => 16 **/
/** 6/12/2016 - есть контроллер, у которого адрес канала (датчика 1W) м.б. например, такой: 28.69A0CC030000 **/
function portNumber(adr) {
  let j;
  if (adr && isNaN(adr)) {
    // Убрать просто все после _, но число не делать
    j = adr.indexOf('_');
    if (j > 0) {
      adr = adr.substr(0, j);
    }
  }
  return adr;
}

function formCurrentTime() {
  //  http://192.168.0.14/sec/?cf=7&stime=10:57:06:4
  const dt = new Date();
  let cf = dt.getDay();
  if (cf == 0) cf = 7; // вс = 7
  let timestr = dt.toLocaleString().substr(-8);
  // return "/sec/?cf=" + cf + "&stime=" + timestr + ":" + dt.getMilliseconds();
  return '/sec/?cf=7&stime=' + timestr + ':' + cf;
}

function doSubstitute(str, sobj) {
  let reg;
  let result;

  if (!str) return '';
  if (!sobj || typeof sobj != 'object') return str;

  result = str;
  for (var item in sobj) {
    reg = new RegExp('%' + item + '%', 'g');
    result = result.replace(reg, sobj[item]);
  }
  return result;
}

function getHttpReqClientIP(req) {
  let j;
  let res = '';

  if (req) {
    res =
      req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;

    if (res) {
      j = res.indexOf('ffff:');
      if (j >= 0) {
        res = res.substr(j + 5);
      }
    }
  }
  return res;
}

function formOneState(str, qobj) {
  if (!str) return '';
  let res = '';

  let arr = str.split('=');

  if (arr[0] && arr[1]) {
    const rItem = formVal(arr[1]);
    if (rItem) {
      res = arr[0] + '=' + rItem + '&';
    }
  }
  return res;

  function formVal(v) {
    let aname;
    if (v.substr(0, 2) == 'ON') return 1;
    if (v.substr(0, 2) == 'OF') return 0;

    if (v.substr(0, 1) == '%') {
      aname = v.substr(1, v.length - 2);
      /* if (qobj && aname && qobj[aname] != undefined) {
        return qobj[aname];
      }
      */
      // Если значения для подстановки нет во входящем сообщении - вернуть ''
      // Для реализации ф-ла для расширенных портов, например,  
      return qobj && aname && qobj[aname] != undefined ? qobj[aname] : '';
    }
    // Любое другое значение - просто отдать
    return v;
  }
}

/**
 * Разбор входящей строки от контроллера
 * Возвращает строку адрес=значение&адрес=значени..
 */
function parse(data, url, adr, prefun, channelId) {
  let result = '';

  let arr;
  if (data && typeof data == 'string') {
    if (adr) {
      if (url.indexOf('cmd=list') > 0) {
        result = readList(data, adr);
      } else if (data.indexOf(';') > 0) {
        // Набор подканалов через ; - MCP??
        arr = data.split(';');

        // Нумерация подканалов внутри канала с 1!!
        for (let i = 0; i < arr.length; i++) {
          if (arr[i]) result += readOneChan(arr[i], adr + '_' + String(i + 1));
        }
      } else {
        result = readOneChan(data, adr);
      }
    } else {
      arr = data.split(';');

      // Нумерация адресов с 0!!
      for (let i = 0; i < arr.length; i++) {
        result += readOneChan(arr[i], i);
      }
    }
  }
  return result;

  // 8aad6a070000:32.43;85a56a070000:32.43;
  function readList(ststr, adrx) {
    let sarr;
    let onearr;
    let res = '';

    if (!ststr || !adrx) return;
    sarr = ststr.split(';');

    if (!sarr || !util.isArray(sarr)) return;

    for (let i = 0; i < sarr.length; i++) {
      if (sarr[i]) {
        onearr = sarr[i].split(':');
        if (onearr.length == 2) {
          let str = onearr[1];
          // DS2413
          if (str.substr(0, 2) == 'OF' || str.substr(0, 2) == 'ON') {
            let xarr = str.split('/');
            if (xarr.length == 1) {
              res = res + adrx + '_' + onearr[0] + '=' + getOnOffValue(xarr[0]) + '&';
            } else {
              res = res + adrx + '_' + onearr[0] + '_A=' + getOnOffValue(xarr[0]) + '&';
              res = res + adrx + '_' + onearr[0] + '_B=' + getOnOffValue(xarr[1]) + '&';
            }
          } else {
            res = res + adrx + '_' + onearr[0] + '=' + onearr[1] + '&';
          }
        }
      }
    }

    return res;
  }

  /**  Разбор одного канала	**/

  function readOneChan(str, adrx) {
    let val;
    let res = '';

    if (!str) return '';

    if (isNaN(str)) {
      if (str.substr(0, 2) == 'OF') {
        val = 0;
      } else if (str.substr(0, 2) == 'ON') {
        val = 1;
      } else {
        res = tryReadSome(str, adrx);
      }
    } else {
      if (channelId) adrx = channelId;
      val = getResultValue(Number(str), adrx);
    }

    if (val != undefined && !isNaN(val)) {
      res = String(adrx) + '=' + String(val) + '&';
    }
    return res;
  }

  function getOnOffValue(str) {
    return str == 'ON' ? 1 : 0;
  }
  /*
// function getResultValue(val, adr) {
function getResultValue(val) {
  if (isNaN(val)) return;

  let result;
  result = val;
  return result;
}
*/

  function getResultValue(val, adrx) {
    if (isNaN(val)) return;

    let res = val;
    adrx = String(adrx);
    if (prefun[adrx]) {
      res = prefun[adrx].fun(val, prefun[adrx].depo);
    }
    return res;
  }

  /** Возможно, значение пришло как temp:25.2/hum:40 или 25.2/40.7  Бывает также просто temp:23.5 	**/

  function tryReadSome(str, adrx) {
    let sarr;
    let val;
    let res = '';

    if (str) {
      sarr = str.split('/');

      if (sarr.length == 1) {
        // Подканалов нет, т.к. нет знака '/'   temp:23.5  => 30=23.5
        val = getResultValue(tryReadNumber(sarr[0]), String(adrx));
        if (!isNaN(val)) {
          res = String(adrx) + '=' + String(val) + '&';
        }
      } else {
        // Нумерация подканалов с 1, подканалы разделены '/' => temp:25.2/hum:40  => 30_1=25.2&30_2=40
        for (var i = 0; i < sarr.length; i++) {
          val = getResultValue(tryReadNumber(sarr[i]), String(adrx) + '_' + String(i + 1));
          if (!isNaN(val)) {
            res = res + String(adrx) + '_' + String(i + 1) + '=' + String(val) + '&';
          }
        }
      }
    }
    return res;
  }

  function tryReadNumber(str) {
    if (str) {
      var sarr = str.split(':');
      return sarr.length == 1 ? Number(sarr[0]) : Number(sarr[1]);
    }
  }
}
