/**
 * Функции подготовки структур при запуске
 */


const ut = require("./utils");

exports.prepareOutReq = prepareOutReq;

/**
 * Подготовка массива исходящих запросов, которые будут вызываться по таймеру
 * Элемент результирующего массива: {url, tick, adr}
 */
function prepareOutReq(params, config) {
  let reqarr = [];

  // Первый запрос - общий опрос
  if (params.allreq) {
    reqarr.push({ url: ut.doSubstitute(params.allreq,{pwd:params.pwd}), tick: Number(params.allreqsek) || 0 });
  }

  config.forEach(item => {
      if (item.req && Number(item.reqsek)>0) {
        reqarr.push({
            url: ut.doSubstitute( item.req, {pwd:params.pwd, adr:ut.portNumber(item.id)}),
            tick: Number(item.reqsek),
            adr: String(item.id)
          });
      }
  })
  return reqarr;
}
