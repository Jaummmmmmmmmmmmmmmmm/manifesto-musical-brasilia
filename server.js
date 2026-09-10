const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const MISTIC_CI = process.env.MISTIC_CI || 'pk_6c1f2e0824d54abd68b793cdae53af8b';
const MISTIC_CS = process.env.MISTIC_CS || 'sk_b75d660e858dfdadcca395391f438ac02e25759926536b9b397700a1c805b4cf';

const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || 'APP_USR-26adbedf-e479-425f-87fe-fe1de247992a';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-66558962318229-070423-b2a65c2cf2cdbb7f10269981a346f572-2966930284';

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

function detectCardBrand(cleanNumber) {
  if (/^4/.test(cleanNumber)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'master';
  if (/^(4011|4312|4389|4514|4573|4576|5041|5066|5090|6277|6362|6363|6500|6504|6505|6507|6509|6516|6550)/.test(cleanNumber)) return 'elo';
  if (/^(34|37)/.test(cleanNumber)) return 'amex';
  if (/^(606282|3841)/.test(cleanNumber)) return 'hipercard';
  return 'visa'; // fallback
}

function createMercadoPagoCardToken(cardData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      cardNumber: cardData.cardNumber,
      securityCode: cardData.securityCode,
      expirationMonth: Number(cardData.expirationMonth),
      expirationYear: Number(cardData.expirationYear),
      cardholder: {
        name: String(cardData.cardholderName).trim().toUpperCase(),
        identification: {
          type: 'CPF',
          number: cardData.cpf
        }
      }
    });

    const options = {
      hostname: 'api.mercadopago.com',
      path: '/v1/card_tokens?public_key=' + MP_PUBLIC_KEY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.id) {
            resolve({ success: true, token: parsed.id });
          } else {
            resolve({ success: false, error: parsed.message || 'Dados do cartão inválidos.' });
          }
        } catch(e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function processMercadoPagoPayment(paymentData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(paymentData);
    const options = {
      hostname: 'api.mercadopago.com',
      path: '/v1/payments',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + MP_ACCESS_TOKEN,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'order_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch(e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function translateMpRejection(detail) {
  const map = {
    'cc_rejected_bad_filled_card_number': 'Número do cartão inválido.',
    'cc_rejected_bad_filled_date': 'Data de validade incorreta.',
    'cc_rejected_bad_filled_security_code': 'Código de segurança (CVV) inválido.',
    'cc_rejected_bad_filled_other': 'Dados do cartão incorretos.',
    'cc_rejected_insufficient_amount': 'Limite insuficiente no cartão.',
    'cc_rejected_call_for_authorize': 'Pagamento não autorizado pelo banco emissor. Entre em contato com seu banco.',
    'cc_rejected_card_disabled': 'Cartão desabilitado. Entre em contato com o banco emissor.',
    'cc_rejected_max_attempts': 'Limite de tentativas excedido.',
    'cc_rejected_duplicated_payment': 'Pagamento duplicado detectado.',
    'cc_rejected_high_risk': 'Transação recusada por políticas de segurança do banco.',
    'cc_rejected_other_reason': 'Transação não autorizada pelo banco emissor.'
  };
  return map[detail] || 'Cartão não autorizado. Verifique os dados ou tente outro cartão.';
}

const requestHandler = (req, res) => {
  const parsedUrl = (req.url || '/').split('?')[0];

  // API Route: POST /api/checkout-card (Mercado Pago Cartão)
  if (req.method === 'POST' && parsedUrl === '/api/checkout-card') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body || '{}');
        const {
          nome, cpf, email, endereco, amount,
          cardNumber, cardholderName, expirationMonth, expirationYear, securityCode,
          installments, itemsSummary
        } = order;

        if (!nome || !cpf || !cardNumber || !securityCode || !amount || amount <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Preencha todos os dados obrigatórios do cartão.' }));
        }

        const cleanCpf = String(cpf).replace(/\D/g, '');
        const cleanCard = String(cardNumber).replace(/\D/g, '');
        const brand = detectCardBrand(cleanCard);

        // 1. Generate Card Token
        const tokenRes = await createMercadoPagoCardToken({
          cardNumber: cleanCard,
          securityCode: String(securityCode).trim(),
          expirationMonth,
          expirationYear,
          cardholderName: cardholderName || nome,
          cpf: cleanCpf
        });

        if (!tokenRes.success || !tokenRes.token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: tokenRes.error || 'Cartão inválido. Verifique o número, validade e código CVV.'
          }));
        }

        // 2. Process payment on Mercado Pago
        const names = String(nome).trim().split(' ');
        const firstName = names[0] || 'Cliente';
        const lastName = names.slice(1).join(' ') || 'Titular';

        const paymentPayload = {
          transaction_amount: Number(Number(amount).toFixed(2)),
          token: tokenRes.token,
          description: `Manifesto Musical Brasília - ${itemsSummary || 'Ingressos'}`,
          installments: Number(installments) || 1,
          payment_method_id: brand,
          payer: {
            email: email || 'cliente@ingressos.com',
            first_name: firstName,
            last_name: lastName,
            identification: {
              type: 'CPF',
              number: cleanCpf
            }
          }
        };

        const mpRes = await processMercadoPagoPayment(paymentPayload);

        if (mpRes.statusCode >= 200 && mpRes.statusCode < 300 && mpRes.data && mpRes.data.id) {
          const status = mpRes.data.status;
          const detail = mpRes.data.status_detail;

          if (status === 'approved') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              status: 'approved',
              paymentId: mpRes.data.id,
              message: 'Pagamento aprovado com sucesso!'
            }));
          } else if (status === 'in_process') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              status: 'in_process',
              paymentId: mpRes.data.id,
              message: 'Pagamento em análise pelo banco. Você receberá a confirmação por e-mail.'
            }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              status: status,
              error: translateMpRejection(detail)
            }));
          }
        } else {
          const rawMsg = mpRes.data?.message || '';
          const friendlyError = (rawMsg === 'not_result_by_params' || rawMsg.includes('card_number'))
            ? 'Dados do cartão não autorizados pelo banco ou número inválido.'
            : (rawMsg || 'Não foi possível autorizar o cartão. Tente novamente ou use PIX.');

          res.writeHead(mpRes.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: friendlyError
          }));
        }
      } catch (err) {
        console.error('Erro /api/checkout-card:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

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
