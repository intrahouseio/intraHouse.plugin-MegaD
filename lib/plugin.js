/**
 * plugin.js
 */
const util = require('util');
const qr = require('querystring');

const ut = require('./utils');

module.exports = {
  params: {
    host: '192.168.0.14',
    port: 80,
    lport: 8081,
    pwd: 'sec',
    allreq: '/%pwd%/?cmd=all',
    allreqsek: 0,
    cmdreq: '/%pwd%/?cmd=',
    stCurrentTime: 0,
    qTimeout: 200
  },

  doCmd: '',

  setParams(obj) {
    if (typeof obj == 'object') {
      Object.keys(obj).forEach(param => {
        if (this.params[param] != undefined) this.params[param] = obj[param];
      });
      this.doCmd = ut.doSubstitute(this.params.cmdreq, {
        pwd: this.params.pwd
      });
    }
  },

  config: [],
  reqarr: [],
  setConfig(arr) {
    if (arr && util.isArray(arr)) {
      this.config = arr;

      // Подготовить массив для опроса
      this.reqarr = prepareOutReq(this.params, arr);

      // Функции обработки
      this.prefun = {};
      this.config.forEach(item => {
        if (item.id && item.usescript && item.script) {
          // let adr = ut.portNumber(item.id);
          let adr = String(item.id);
          try {
            this.prefun[adr] = { depo: {} };
            let fun = createFun(item.script);
            if (typeof fun == 'function') {
              this.prefun[adr].fun = fun;
            } else throw new Error('Not a function!!');
          } catch (e) {
            this.prefun[adr] = '';
            throw new Error('User script for channel ' + adr + ' ERROR: ' + e.message);
          }
        }
      });

      // Подготовить store для хранения выходов, которые должны восстанавливаться по restore
      this.store = {};
      this.config.forEach(item => {
        if (item.id && item.restore) {
          let adr = ut.portNumber(item.id);
          this.store[adr] = 0;
        }
      });

      this.formTimers(true);
    }
  },

  extra: [],
  setExtra(arr) {
    if (arr && util.isArray(arr)) this.extra = arr;
  },

  timers: [],

  formTimers(all) {
    let curtime = Date.now();

    this.timers = [];
    for (var i = 0; i < this.reqarr.length; i++) {
      /*
      if (i == 0) {
        this.timers.push({ index: 0, qtime: curtime });
      } else {
        // нужно вставить с учетом сортировки, чтобы время было через интервал сразу
        this.resetTimer({ index: i, qtime: 0 }, curtime);
      }
      */
      // Опрашиваем все подряд - при запуске плагина. При перезапуске контроллера - только те у которых установлен tick
      if (all || this.reqarr[i].tick > 0) {
        this.timers.push({ index: i, qtime: curtime });
      }
    }

    // Передать текущее время - опционально
    if (this.params.stCurrentTime) this.addActReq(ut.formCurrentTime());
  },

  /** Включить запрос в массив таймеров снова, если есть интервал опроса **/
  resetTimer(index, tick) {
    if (index < 0 || index >= this.reqarr.length) return;
    if (!tick) tick = this.reqarr[index].tick;

    if (tick > 0) {
      const curtime = Date.now();

      const item = { index, qtime: curtime + tick * 1000 };

      let i = 0;
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

  getNextReq() {
    if (this.timers.length > 0) {
      let curtime = Date.now();
      if (this.timers[0].qtime <= curtime) {
        let item = this.timers.shift();
        if (item.index >= 0) {
          // this.resetTimer(item, curtime); Взводить заново при получении ответа
          return this.getReqObj(item.index);
        }
        if (item.reqObj) {
          // Команда или действие
          return item.reqObj;
        }
      }
    }
  },

  getReqObj(index) {
    if (index >= 0) {
      return {
        url: this.reqarr[index].url,
        adr: this.reqarr[index].adr,

        host: this.params.host,
        port: this.params.port,
        stopOnError: true,
        index
      };
    }
  },

  addAct(item) {
    if (item.id ) {
      let value;
      let cmd;

      // if ((item.command == "set") || Array.isArray(item.value)) {
      if (item.desc == 'AO' || Array.isArray(item.value)) {
        value = transformValue(item, item.value); // Нужно преобразовать с учетом коэффициентов или для RGB
        if (item.set) {
          // Задана команда, нужно сделать подстановку
          cmd = ut.doSubstitute(item.set, {
            pwd: this.params.pwd,
            adr: ut.portNumber(item.id),
            value
          });
        }
      } else if (item.command == 'on' || item.command == 'off') {
        value = item.command == 'on' ? 1 : 0;
      } else value = item.value || 0;
      
      if (!cmd) cmd = this.formCmd(item.id, value);

      this.addActReq(cmd, [{ id: item.id, value }]);
    }
  },

  formCmd(id, value) {
    // /sec/?cmd=32A:0&adr=5566778822 for id=32_5566778822_A или B

    let cmd = tryAB_ReleCommand(id, value);

    // /sec/?cmd=14:0
    return this.doCmd + (cmd || id + ':' + value);
  },

  addActReq(url, passBack) {
    const reqObj = {
      url,
      host: this.params.host,
      port: this.params.port,
      stopOnError: false,
      passBack
    };

    // this.timers.unshift({ index: -1, qtime: Date.now(), reqObj });
    // Добавить не в начало списка, а в конец команд (-1)
    let item = { index: -1, qtime: Date.now(), reqObj };
    let i = 0;
    while (i < this.timers.length) {
      if (this.timers[i].index >= 0) {
        this.timers.splice(i, 0, item);
        return;
      }
      i++;
    }
    // Только команды или список пуст
    this.timers.push(item);
  },

  onSt1() {
    this.formTimers();

    // Передать команды включения для выходов, сохраняемых в restore
    this.restoreOuts();
  },

  restoreOuts() {
    Object.keys(this.store).forEach(adr => {
      if (this.store[adr] == 1) {
        this.addActReq(this.doCmd + adr + ':' + 1, [{ id: adr, value: 1 }]);
      }
    });
  },

  processSendData(payload) {
    if (!payload) return;

    let data;
    if (util.isArray(payload)) {
      data = payload;
    } else if (typeof payload == 'string') {
      // Получаем строку adr=val&adr=val&...
      let robj = qr.parse(payload);

      // Преобразуем {adr:val, ..} => [{id:'1', value:'1'}]
      if (robj) {
        data = Object.keys(robj).map(adr => ({ id: adr, value: robj[adr] }));
      }
    }
    if (!data) return;

    // Сохраним значения из store для restore
    data.forEach(item => {
      if (this.store[item.id] != undefined) this.store[item.id] = item.value;
    });
    process.send({ type: 'data', data });
  },

  /** Установить значения состояния **/
  setStates(ststr, qobj) {
    if (!ststr) return;
    let result = '';

    // 2=ON&3=OFF&4=*&5=%v%
    let sarr = ststr.split('&');
    if (!sarr || !util.isArray(sarr)) return;

    for (var i = 0; i < sarr.length; i++) {
      if (sarr[i]) {
        result += ut.formOneState(sarr[i], qobj);
      }
    }
    // Предварительно их надо обработать, возможно, они зависят от входящих значений!! 7=%val%
    // Или от предыдущего состояния - например, 7:2 - это toggle? - это уже должен делать procMGD???
    //  Результат - строка adr=val&
    return result;
  }
};

/*
function getCmdAllReq(params) {
  return params.allreq
    ? {
        url: ut.doSubstitute(params.allreq, { pwd: params.pwd }),
        tick: Number(params.allreqsek) || 0
      }
    : "";
}
*/

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

function createFun(script) {
  // script = script.replace(/\n/g,' ');
  let i = script.indexOf('{');
  let j = script.lastIndexOf('}');

  if (i <= 0 || j <= 0 || i > j) {
    throw new Error('Not found { } in script: ' + script);
  }

  let funstr = script.substring(i + 1, j);
  return new Function('val, depo', funstr);
}

function tryAB_ReleCommand(id, value) {
  // 32_ffaa7892678_A - DS2413
  let xarr = id.split('_');

  if (
    xarr.length == 3 &&
    (xarr[2] == 'A' || xarr[2] == 'B') &&
    xarr[1].length > 10 &&
    !isNaN(xarr[0]) && xarr[0] < 99 && xarr[0] > 0
  ) {
    // 32A:1&adr=ffaa7892678
    return xarr[0] + xarr[2] + ':' + value + '&addr=' + xarr[1];
  }
}

function transformValue(item, value) {
  if (Array.isArray(value) && value.length >= 3) {
    // Из массива сделать RGB, взять только 3 элемента
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += pad2(value[i].toString(16).toUpperCase());
    }
    return result;
  }

  return value > 0 && item.ks > 0 && item.kh > 0 && item.ks != item.kh
    ? Math.round((value * item.kh) / item.ks)
    : value;
}

function pad2(x) {
  return x.length < 2 ? '0' + x : x;
}
