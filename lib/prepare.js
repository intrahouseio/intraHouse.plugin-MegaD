/**
 * Функции подготовки структур при запуске
 */
const util = require("util");
const url = require("url");
const qr = require("querystring");

const ut = require("./utils");

exports.prepareOutReq = prepareOutReq;
exports.formTableMReq = formTableMReq;

/**
 * Подготовка массива исходящих запросов, которые будут вызываться по таймеру
 * Элемент результирующего массива: {url, tick, adr}
 */
function prepareOutReq(params, config) {
  let reqarr = [];

  // Первый запрос - общий опрос
  if (params.allreq) {
    reqarr.push({
      url: ut.doSubstitute(params.allreq, { pwd: params.pwd }),
      tick: Number(params.allreqsek) || 0
    });
  }

  config.forEach(item => {
    if (item.req && Number(item.reqsek) > 0) {
      reqarr.push({
        url: ut.doSubstitute(item.req, {
          pwd: params.pwd,
          adr: ut.portNumber(item.id)
        }),
        tick: Number(item.reqsek),
        adr: String(item.id)
      });
    }
  });
  return reqarr;
}

/** Формирование таблицы входящих запросов
 *
 **/
function formTableMReq(reqarr) {
  if (!reqarr || !util.isArray(reqarr)) return [];

  let id;
  let tbl = {};
  let index = -1;
  let pathname;

  for (var i = 0; i < reqarr.length; i++) {
    // сформировать объект
    onereq = getOneReqObj(reqarr[i]);
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
      tbl[pathname][id].splice(j, 0, onereq);
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


