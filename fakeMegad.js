/**
 * Эмулятор контроллера - слушает запросы на port
 * Запуск  node fakeMegad 8090 (port)
 */

const http = require('http');

const port = process.argv[2];
if (!port) {
  console.log('Expected port as argv!');
  process.exit();
}

let pt1Value = 0;

start();

function start() {
  http
    .createServer(onRequest)
    .listen(port)
    .on('error', e => {
      let msg = e.code == 'EADDRINUSE' ? 'Address in use' : `${e.code} Stopped.`;
      console.log(`HTTP server port: ${port} error ${e.errno}. ${msg}`);
      process.exit(1);
    });

  console.log('Listening localhost:' + port);

  function onRequest(request, response) {
    // let ip = ut.getHttpReqClientIP(request);
    console.log('=> HTTP GET ' + request.url);

    // let qobj = url.parse(request.url, true).query;
    let answer;
    switch (request.url) {
      // Состояние pt=1
      case '/sec/?pt=1&cmd=get':
        answer = pt1Value ? 'ON' : 'OFF';
        break;

      // Управление pt=1 = вкл
      case '/sec/?pt=1&cmd=1:1':
        pt1Value = 1;
        answer = 'Done';
        break;

      // Управление pt=1 = выкл
      case '/sec/?pt=1&cmd=1:0':
        pt1Value = 0;
        answer = 'Done';
        break;

      case '/sec/?pt=30&cmd=get':
        answer = 'temp:2.38/press:754.86/hum:102.400';
        break;

      case '/sec/?pt=32&cmd=get':
        answer = 'ON;OFF;ON;OFF;ON;';
        break;
      case '/sec/?pt=33&cmd=get':
        answer = '42';
        break;
      default:
        answer = '';
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(answer);
    response.on('error', e => {
      console.log('<= ERROR:' + e.code);
    });
  }
}
