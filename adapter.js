/**
 * Функции - адаптеры для megad
 */
const util = require('util');

module.exports = {
  // readTele - перехват сообщений типа type:data и обработка
  // {type:data, data:[{id:xx, value:0/1/255/TG/CNT}]}
  // Если устройства нет - исключаем
  // Число для счетчика - исключаем
  readTele(tele, readMap, houser) {
    return tele && typeof tele == 'object' && tele.type == 'data' && tele.data
      ? { type: 'data', data: processData() }
      : tele;

    function processData() {
      if (!util.isArray(tele.data)) return [];

      return tele.data.map(item => processOne(item)).filter(item => typeof item == 'object');
    }

    function processOne(item) {
      let dobj = getDevice(item);
      if (!dobj) return '';

      // Если число - то счетчик нужно исключить, т к в общем опросе он передает 1!
      if (dobj.cl == 'Meter') {
        if (item.value == 'CNT' || item.value == 'COUNT') {
          item.value = countIt(dobj, readMap.get(item.id));
        } else delete item.value;
      } else if (item.value == 'TG' || item.value == 'TOGGLE') {
        item.value = toggleIt(dobj);
      } else if (dobj.cl == 'ActorA') {
        item.value = transformAnalog(dobj, readMap.get(item.id), item.value);
      }

      return item.value != undefined ? item : '';
    }

    function getDevice(item) {
      if (item.id && readMap.has(item.id)) {
        let dn = readMap.get(item.id).dn;
        return dn ? houser.getDevobj(dn) : '';
      }
    }

    function transformAnalog(dobj, readMapItem, value) {
      let result = value;
      if (dobj.isRGB()) {
        result = hexToArray(value);
      } else {
        let ks = readMapItem.ks > 0 ? readMapItem.ks : 1;
        let kh = readMapItem.kh > 0 ? readMapItem.kh : 1;
        if (ks != kh) {
          // result = Math.round((value * ks * 100) / kh) / 100; // 255/255*100
          result = Math.round((value * ks) / kh); // 255/255*100
        }
      }
      return result;
    }

    function hexToArray(value) {
      let result = value;
      if (value && value.length > 5) {
        result = [];
        result.push(parseInt(value.substr(0, 2), 16));
        result.push(parseInt(value.substr(2, 2), 16));
        result.push(parseInt(value.substr(4, 2), 16));
        result.push(0);
        result.push(0);
      }
      return result;
    }

    // Переключить состояние устройства, а мега сама переключит
    function toggleIt(dobj) {
      if (dobj && dobj.cl == 'ActorD') {
        return dobj.dval == 1 ? '0' : '1';
      }
      if (dobj && dobj.cl == 'ActorA') {
        // Анализируем дискретное состояние аналогового канала, устанавливаем aval
        return dobj.dval > 0 ? '0' : dobj.defval || 100;
      }
    }

    function countIt(dobj, readMapItem) {
      let weight = readMapItem.weight > 0 ? readMapItem.weight : 1;

      let aval = isNaN(dobj.aval) ? 1 : Number(dobj.aval);

      // Результат округлить до не более чем 6 знаков после запятой. Меньше нельзя - вес может быть очень маленький
      aval += 1 * weight;
      aval = aval.toString().length > 15 ? Math.round(aval * 1000000) / 1000000 : aval;
      return aval;
    }
  },
  readTeleV5(tele, readMap, holder) {
    return tele && typeof tele == 'object' && tele.type == 'data' && tele.data
      ? { type: 'data', data: processData() }
      : tele;

    function processData() {
      if (!util.isArray(tele.data)) return [];

      return tele.data.map(item => processOne(item)).filter(item => typeof item == 'object');
    }

    function processOne(item) {
      const readItem = readMap.get(item.id);
      if (!readItem) {
        return item;
      }
      const dobj = readItem.did && holder.devSet[readItem.did] ? holder.devSet[readItem.did] : '';

      // Если число - то счетчик нужно исключить, т к в общем опросе он передает 1!
      if (readItem.desc == 'Meter') {
        if (item.value == 'CNT' || item.value == 'COUNT') {
          item.value = countIt(dobj, readItem);
        } else delete item.value;
      } else if (item.value == 'TG' || item.value == 'TOGGLE') {
        item.value = toggleIt(dobj, readItem);
      } else if (readItem.desc == 'AO') {
        item.value = transformAnalog(dobj, readItem, item.value);
      } else if (readItem.desc == 'RGB') {
        item.value = hexToArray(item.value);
      }

      return item.value != undefined ? item : '';
    }

    function transformAnalog(dobj, readMapItem, value) {
      let result = value;

      let ks = readMapItem.ks > 0 ? readMapItem.ks : 1;
      let kh = readMapItem.kh > 0 ? readMapItem.kh : 1;
      if (ks != kh) {
        // result = Math.round((value * ks * 100) / kh) / 100; // 255/255*100
        result = Math.round((value * ks) / kh); // 255/255*100
      }

      return result;
    }

    function hexToArray(value) {
      let result = value;
      if (value && value.length > 5) {
        result = [];
        result.push(parseInt(value.substr(0, 2), 16));
        result.push(parseInt(value.substr(2, 2), 16));
        result.push(parseInt(value.substr(4, 2), 16));
        result.push(0);
        result.push(0);
      }
      return result;
    }

    // Переключить состояние устройства, а мега сама переключит
    function toggleIt(dobj, readMapItem) {
      const prop = readMapItem.prop;
      if (!dobj || !prop) return 2;

      return dobj[prop] ? 0 : 1;

      /*
      if (dobj && dobj.cl == "ActorD") {
        return dobj.dval == 1 ? "0" : "1";
      }
      if (dobj && dobj.cl == "ActorA") {
        // Анализируем дискретное состояние аналогового канала, устанавливаем aval
        return dobj.dval > 0 ? "0" : dobj.defval || 100;
      }
      */
    }

    function countIt(dobj, readMapItem) {
      const prop = readMapItem.prop;
      if (!dobj || !prop) return 1;

      let weight = readMapItem.weight > 0 ? readMapItem.weight : 1;

      let aval = isNaN(dobj[prop]) ? 1 : Number(dobj[prop]);

      // Результат округлить до не более чем 6 знаков после запятой. Меньше нельзя - вес может быть очень маленький
      aval += 1 * weight;
      aval = aval.toString().length > 15 ? Math.round(aval * 1000000) / 1000000 : aval;
      return aval;
    }
  }
};
