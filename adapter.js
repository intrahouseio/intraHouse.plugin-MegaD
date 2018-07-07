/**
 * Функции - адаптеры для megad
 */
const util = require("util");

module.exports = {
  // readTele - перехват сообщений типа type:data и обработка
  // {type:data, data:[{id:xx, value:0/1/255/TG/CNT}]}
  // Если устройства нет - исключаем
  // Число для счетчика - исключаем
  readTele(tele, readMap, houser) {
    return tele && typeof tele == "object" && tele.type == "data" && tele.data
      ? { type: "data", data: processData() }
      : tele;

    function processData() {
      if (!util.isArray(tele.data)) return [];

      return tele.data
        .map(item => processOne(item))
        .filter(item => typeof item == "object");
    }

    function processOne(item) {
      let dobj = getDevice(item);
      if (!dobj) return "";

      // Если число - то счетчик нужно исключить, т к в общем опросе он передает 1!
      if (dobj.cl == "Meter") {
        if (item.value == "CNT" || item.value == "COUNT") {
          item.value = countIt(dobj, readMap.get(item.id));
        } else delete item.value;
      } else if (item.value == "TG" || item.value == "TOGGLE") {
        item.value = toggleIt(dobj);
      }
      return item.value != undefined ? item : "";
    }

    function getDevice(item) {
      if (item.id && readMap.has(item.id)) {
        let dn = readMap.get(item.id).dn;
        return dn ? houser.getDevobj(dn) : "";
      }
    }

    // Переключить состояние устройства, а мега сама переключит
    function toggleIt(dobj) {
      if (dobj && dobj.cl == "ActorD") {
        return dobj.dval == 1 ? "0" : "1";
      }
      if (dobj && dobj.cl == "ActorA") {
        // Анализируем дискретное состояние аналогового канала, устанавливаем aval
        return dobj.dval > 0 ? "0" : dobj.defval || 100;
      }
    }

    function countIt(dobj, readMapItem) {
      let weight = readMapItem.weight > 0 ? readMapItem.weight : 1;
      let aval = isNaN(dobj.aval) ? 1 : Number(dobj.aval);
      return aval + 1 * weight;
    }
    }
};
