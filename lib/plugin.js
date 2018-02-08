/**
 * plugin.js
 */
const util = require("util");
const qr = require("querystring");

const ut = require("./utils");

module.exports = {
  params: {
    host: "192.168.0.14",
    port: 80,
    lport: 8081,
    pwd: "sec",
    allreq: "/%pwd%/?cmd=all",
    allreqsek: 0,
    cmdreq:"/%pwd%/?cmd"
  },
  
  doCmd:"",

  setParams (obj) {
    
    if (typeof obj == "object") {
      Object.keys(obj).forEach(param => {
        if (this.params[param] != undefined) this.params[param] = obj[param];
      });
      this.doCmd =ut.doSubstitute(this.params.cmdreq, { pwd: this.params.pwd });
    }
  },

  config: [],
  reqarr: [],
  setConfig (arr) {
    if (arr && util.isArray(arr)) {
     this.config = arr;
     this.reqarr = prepareOutReq(this.params, arr);
     this.formTimers();
    }  
  },

  extra: [],
  setExtra (arr)  {
    if (arr && util.isArray(arr)) this.extra = arr;
  },

  timers: [],
  formTimers()  {
    let curtime = Date.now();

    this.timers = [];
    for (var i = 0; i < this.reqarr.length; i++) {
      if (i == 0) {
        this.timers.push({ index: 0, qtime: curtime });
      } else {
        // нужно вставить с учетом сортировки, чтобы время было через интервал сразу
        this.resetTimer({ index: i, qtime: 0 }, curtime);
      }
    }
  },

  /** Включить запрос в массив таймеров снова, если есть интервал опроса 	**/
  resetTimer (item, curtime) {
    let i;
  
    if (item && item.index < this.reqarr.length && this.reqarr[item.index].tick > 0) {
      item.qtime = curtime + this.reqarr[item.index].tick * 1000;
      i = 0;
      while (i < this.timers.length) {
        if (this.timers[i].qtime > item.qtime) {
          this.timers.splice(i, 0, item);
          return;
        }
        i++;
      }
      this.timers.push(item);
    }
  },

  getNextReq () {
    if (this.timers.length > 0) {
      let curtime = Date.now();
      if (this.timers[0].qtime <= curtime) {
        let item = this.timers.shift();
        this.resetTimer(item, curtime);
        return item;
      }
    }
  },

  processSendData (payload) {
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
    process.send({ type: "data", data });
  },

  /** Установить значения состояния 	**/
  setStates (ststr, qobj)  {
    if (!ststr) return;
    let result = "";

    // 2=ON&3=OFF&4=*&5=%v%
    let sarr = ststr.split("&");  
    if (!sarr || !util.isArray(sarr)) return;
  
    for (var i = 0; i < sarr.length; i++) {
      if (sarr[i]) {
        result = result + ut.formOneState(sarr[i], qobj);
      }
    }
    // Предварительно их надо обработать, возможно, они зависят от входящих значений!! 7=%val%
    // Или от предыдущего состояния - например, 7:2 - это toggle? - это уже должен делать procMGD???
    //  Результат - строка adr=val&
    return result;
  }
};

/**
 * Подготовка массива исходящих запросов, которые будут вызываться по таймеру
 * Элемент результирующего массива: {url, tick, adr}
 */
function prepareOutReq(params, config) {
    let res = [];
  
    // Первый запрос - общий опрос
    if (params.allreq) {
      res.push({
        url: ut.doSubstitute(params.allreq, { pwd: params.pwd }),
        tick: Number(params.allreqsek) || 0
      });
    }
  
    config.forEach(item => {
      if (item.req && Number(item.reqsek) > 0) {
        res.push({
          url: ut.doSubstitute(item.req, {
            pwd: params.pwd,
            adr: ut.portNumber(item.id)
          }),
          tick: Number(item.reqsek),
          adr: String(item.id)
        });
      }
    });
    return res;
  }