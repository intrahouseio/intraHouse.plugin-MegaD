/**
 * simpleServer.js
 * 
 * Запуск с параметром port 
 *    node simpleServer 8899
 *  Сервер слушает входящие http запросы на порту xxxx
 *   
 *  В ответ на входящее pt=15&click=1 отправляет 22:2
 *  В ответ на входящее pt=16&click=1 отправляет 23:2
 */

const http = require('http');
const url = require('url');

const port = process.argv[2];
if (!port) {
  console.log('Порт не определен!');
  process.exit();
}

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
  console.log('=> HTTP GET ' + request.url);

  const qobj = url.parse(request.url, true).query;
  let answer = '';

  if (qobj.pt == 15 && qobj.click == 1) {
    answer = '22:2';
  } else if (qobj.pt == 16 && qobj.click == 1) {
    answer = '23:2';
  }

  // Вариант без Content-Length - настройка 16 порта будет сброшена при сработке порта 15 или 16
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  // Замена на эту команду решает проблему
  // response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': String(answer.length) });

  response.end(answer);
  console.log('<= ' + answer);

  response.on('error', e => {
    console.log('<= ERROR:' + e.code);
  });
}