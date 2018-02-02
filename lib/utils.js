/**
 * Утилиты
 */

exports.portNumber = portNumber;
exports.doSubstitute = doSubstitute;
exports.parse = parse;

/** Для исключения подканала из адреса: 16_1 => 16 **/
/** 6/12/2016 - есть контроллер, у которого адрес канала (датчика 1W) м.б. например, такой: 28.69A0CC030000 **/
function portNumber(adr) {
  let j;
  if (adr && isNaN(adr)) {
    //adr = String( parseInt(adr) );

    // Убрать просто все после _, но число не делать
    j = adr.indexOf("_");
    if (j > 0) {
      adr = adr.substr(0, j);
    }
  }
  return adr;
}

function doSubstitute(str, sobj) {
  let reg;
  let result;

  if (!str) return "";
  if (!sobj || typeof sobj != "object") return str;

  result = str;
  for (var item in sobj) {
    reg = new RegExp("%" + item + "%", "g");
    result = result.replace(reg, sobj[item]);
  }
  return result;
}


/**
 * Разбор входящей строки от контроллера
 * Возвращает строку адрес=значение&адрес=значени..
 */
function parse(data, url, adr) {
  let result="";  
  if (data && typeof data == "string") {
    if (adr) {
      // Для команды list
      if (url.indexOf("cmd=list") > 0) {
        result = readList(data, adr);
      } else {
        result = readOneChan(data, adr);
      }
    } else {
      arr = data.split(";");

      // Нумерация адресов с 0!!
      for (var i = 0; i < arr.length; i++) {
        result = result + readOneChan(arr[i], i);
      }
    }
  }
  return result;
}

// 8aad6a070000:32.43;85a56a070000:32.43;
function readList(ststr, adr) {
  var sarr,
    onearr,
    result = "";

  if (!ststr || !adr) return;
  sarr = ststr.split(";");

  if (!sarr || !util.isArray(sarr)) return;

  for (var i = 0; i < sarr.length; i++) {
    if (sarr[i]) {
      onearr = sarr[i].split(":");
      if (onearr.length == 2) {
        result = result + adr + "_" + onearr[0] + "=" + onearr[1] + "&";
      }
    }
  }

  return result;
}

/**  Разбор одного канала	**/

function readOneChan(str, adr) {
  var val,
    res = "";

  if (isNaN(str)) {
    if (str.substr(0, 2) == "OF") {
      val = 0;
    } else if (str.substr(0, 2) == "ON") {
      val = 1;
    } else {
      res = tryReadSome(str, adr);
    }
  } else {
    val = getResultValue(Number(str), adr);
  }

  if (val != undefined && !isNaN(val)) {
    res = String(adr) + "=" + String(val) + "&";
  }
  return res;
}

function getResultValue(val, adr) {
  var result, funret;
  if (isNaN(val)) return;

  result = val;
  return result;
}

/** Возможно, значение пришло как temp:25.2/hum:40 или 25.2/40.7  Бывает также просто temp:23.5 	**/

function tryReadSome(str, adr) {
  var sarr,
    val,
    res = "";

  if (str) {
    sarr = str.split("/");

    if (sarr.length == 1) {
      // Подканалов нет, т.к. нет знака '/'   temp:23.5  => 30=23.5
      val = getResultValue(tryReadNumber(sarr[0]), String(adr));
      if (!isNaN(val)) {
        res = String(adr) + "=" + String(val) + "&";
      }
    } else {
      // Нумерация подканалов с 1, подканалы разделены '/' => temp:25.2/hum:40  => 30_1=25.2&30_2=40
      for (var i = 0; i < sarr.length; i++) {
        val = getResultValue(
          tryReadNumber(sarr[i]),
          String(adr) + "_" + String(i + 1)
        );
        if (!isNaN(val)) {
          res =
            res + String(adr) + "_" + String(i + 1) + "=" + String(val) + "&";
        }
      }
    }
  }
  return res;
}

function tryReadNumber(str) {
  if (str) {
    var sarr = str.split(":");
    return sarr.length == 1 ? Number(sarr[0]) : Number(sarr[1]);
  }
}