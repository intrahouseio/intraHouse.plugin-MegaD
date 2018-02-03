/**
 * Функции - адаптеры для megad
 */
const util = require("util");

module.exports = {
  // {type:data, data:[{id:xx, value:'TG/CNT'}]}
  readTele: function(tele, readMap, houser) {
    if (tele && typeof tele == "object" && tele.type == "data" && tele.data) {
      if (util.isArray(tele.data)) {
        tele.data.forEach(item => {
          if (item.value == "TG" || item.value == "TOGGLE") {
            let value = toggleIt(getDevice(item));
            if (value != undefined) item.value = value;
          }
          if (item.value == "CNT" || item.value == "COUNT") {
            let value = countIt(getDevice(item));
            if (value != undefined) item.value = value;
          }
        });
      }
    }
    return tele;

    function getDevice(item) {
      if (item.id && readMap.has(item.id)) {
        let dn = readMap.get(item.id).dn;
        if (!dn) return;

        return houser.getDevobj(dn);
      }
    }

    // Переключить состояние устройства, а мега сама переключит
    function toggleIt(dobj) {
      if (dobj && (dobj.cl == "ActorD" || dobj.cl == "ActorA")) {
        if (dobj.cl == "ActorD") {
          return dobj.dval == 1 ? "0" : "1";
        }

        if (dobj.dval > 0) {
          // Дискретное состояние аналогового канала
          return "0";
        }
        return dobj.defval || 100;
      }
    }

    function countIt(dobj) {
      if (dobj && dobj.cl == "Meter") {
        // return Number(dobj.aval) + 1 * koef;
        if (isNaN(dobj.aval)) return 1;
        return Number(dobj.aval) + 1;
      }
    }
  }
};
