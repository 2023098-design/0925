// 로컬 정적 서버 — index.html 을 브라우저에서 열기 위한 것
//   node serve.js          → http://localhost:8000
//   node serve.js 8001     → 포트 바꾸기
//
// 왜 필요한가: index.html 을 더블클릭해 열면 브라우저가 로컬 파일의 fetch 를 막습니다.
// 이 서버는 이 폴더의 파일을 그대로 내보내기만 합니다. W6 의 Express 서버(server/)와는 다릅니다.
// Node 내장 모듈만 씁니다. npm install 이 필요 없습니다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2]) || 8000;
const root = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.glb':  'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.mjs':  'text/javascript; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.glsl': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // 이 폴더 바깥의 파일은 절대 내보내지 않습니다
  const filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 — ${urlPath} 파일이 없습니다`);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',   // 고친 파일이 바로 보이게
    });
    res.end(data);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`포트 ${port} 가 이미 쓰이고 있습니다. 다른 번호로:  node serve.js ${port + 1}`);
  } else {
    console.error(e.message);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`http://localhost:${port}  ← 브라우저에서 여세요`);
  console.log(`(${root} 의 파일을 내보내는 중 · 끄려면 Ctrl + C)`);
});
