const child = require("child_process");

let ps = child.fork("./megad.js");



ps.on("message", mes => {
  console.log("Message: " + JSON.stringify(mes));
  if (mes.type == "get") {

    switch (mes.tablename) {
      case "params":
        ps.send({ type: "get", params: { host: "192.168.0.140", port: 8888} });
        break;

      case "extra":
        ps.send({
          type: "get",
          extra: [
           
          ]
        });
        break;

        case "config":
        ps.send({
          type: "get",
          config: [
           
          ]
        });
        break;

        case "log":
        case "debug":
        console.log(mes.txt);
        break;
        
      default:
    }
  }
});

ps.on("close", code => {
  console.log("PLUGIN CLOSED. code=" + code);
});
