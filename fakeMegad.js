/**
 * Эмулятор контроллера - слушает запросы на port
 * Запуск  node fakeMegad 8090 (port)
 */


const http = require("http");


const port = process.argv[2];
if (!port) {
  console.log("Expected port as argv!");
  process.exit();
}

start();

function start() {
  http
    .createServer(onRequest)
    .listen(port)
    .on("error", e => {
      let msg =
        e.code == "EADDRINUSE" ? "Address in use" : `${e.code} Stopped.`;
      console.log(`HTTP server port: ${port} error ${e.errno}. ${msg}`);
      process.exit(1);
    });

  console.log("Listening localhost:" + port);

  function onRequest(request, response) {
    // let ip = ut.getHttpReqClientIP(request);
    console.log("=> HTTP GET " + request.url);

    // let qobj = url.parse(request.url, true).query;
    let answer;
    switch (request.url) {
        case '/sec/?pt=1&cmd=get':
        answer = 'ON';
        break;

        case '/sec/?pt=32&cmd=get':
        answer = 'ON;OFF;ON;OFF;ON;';
        break;
        
        default: answer='';
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(answer);
    response.on("error", e => {
        console.log("<= ERROR:" + e.code);
    });

  }

}
