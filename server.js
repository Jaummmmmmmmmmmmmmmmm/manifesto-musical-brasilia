const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const MISTIC_CI = process.env.MISTIC_CI || 'pk_6c1f2e0824d54abd68b793cdae53af8b';
const MISTIC_CS = process.env.MISTIC_CS || 'sk_b75d660e858dfdadcca395391f438ac02e25759926536b9b397700a1c805b4cf';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
};

function createMisticTransaction(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.misticpay.com',
      path: '/api/transactions/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'ci': MISTIC_CI,
        'cs': MISTIC_CS
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          reject(new Error(`Erro ao interpretar resposta MisticPay: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const requestHandler = (req, res) => {
  const parsedUrl = (req.url || '/').split('?')[0];

  // API Route: POST /api/checkout
  if (req.method === 'POST' && parsedUrl === '/api/checkout') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body || '{}');

        const { nome, cpf, email, endereco, amount, items } = order;

        if (!nome || !cpf || !amount || amount <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Nome, CPF e valor válido são obrigatórios.' }));
        }

        const cleanCpf = String(cpf).replace(/\D/g, '');
        const transId = 'mm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

        const misticPayload = {
          amount: Number(Number(amount).toFixed(2)),
          payerName: String(nome).trim(),
          payerDocument: cleanCpf,
          transactionId: transId,
          description: `Manifesto Musical Brasília - ${order.itemsSummary || 'Ingressos'}`
        };

        const result = await createMisticTransaction(misticPayload);

        if (result.statusCode >= 200 && result.statusCode < 300 && result.data && result.data.data) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            orderId: transId,
            qrCodeBase64: result.data.data.qrCodeBase64,
            qrcodeUrl: result.data.data.qrcodeUrl,
            copyPaste: result.data.data.copyPaste,
            amount: result.data.data.transactionAmount,
            state: result.data.data.transactionState
          }));
        } else {
          res.writeHead(result.statusCode || 500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: result.data?.message || 'Erro ao gerar cobrança PIX na MisticPay'
          }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  let rawUrl = parsedUrl;
  if (rawUrl === '/' || rawUrl === '') rawUrl = '/index.html';
  const cleanPath = rawUrl.replace(/^\/+/, '');

  const basePath = __dirname;
  const filePath = path.join(basePath, cleanPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.end(fs.readFileSync(filePath));
  }

  // Fallback to index.html
  const indexPath = path.join(basePath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(indexPath));
  }

  res.statusCode = 404;
  res.end('Not found');
};

// Export for Vercel Serverless Function
module.exports = requestHandler;

// If run directly (node server.js), listen on PORT
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`Servidor Guichê Web rodando em http://localhost:${PORT}`);
  });
}
