// Локальный сервер для теста зигзага: node serve.cjs [порт]
// Нужен, т.к. levels.build.json грузится через fetch (file:// не подойдёт).
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = Number(process.argv[2]) || 8000;
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png', '.ics': 'text/calendar' };
http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^[/\\]+/, '');
  const f = path.join(__dirname, p === '' ? 'zigzag.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Зигзаг: http://localhost:${port}/zigzag.html`));
