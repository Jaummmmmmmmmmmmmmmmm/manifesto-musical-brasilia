const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const MISTIC_CI = process.env.MISTIC_CI || 'pk_6c1f2e0824d54abd68b793cdae53af8b';
const MISTIC_CS = process.env.MISTIC_CS || 'sk_b75d660e858dfdadcca395391f438ac02e25759926536b9b397700a1c805b4cf';

const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || 'APP_USR-26adbedf-e479-425f-87fe-fe1de247992a';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-66558962318229-070423-b2a65c2cf2cdbb7f10269981a346f572-2966930284';

// Admin & Persistence Configuration
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manifesto2026';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const DB_FILE = path.join(process.env.TMPDIR || process.env.TEMP || '/tmp', 'manifesto_orders.json');

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

// Preload main static files for instant response & NFT bundling
const staticCache = {};
try { staticCache['/style.css'] = fs.readFileSync(path.join(__dirname, 'style.css')); } catch (e) {}
try { staticCache['/index.html'] = fs.readFileSync(path.join(__dirname, 'index.html')); } catch (e) {}
try { staticCache['/admin.html'] = fs.readFileSync(path.join(__dirname, 'admin.html')); } catch (e) {}
try { staticCache['/js/app.js'] = fs.readFileSync(path.join(__dirname, 'js', 'app.js')); } catch (e) {}

// Global persistent store across all serverless lambda instances (prevents orders from disappearing)
const CLOUD_STORE_URL = 'https://api.restful-api.dev/objects/ff808181a067127101a08da827206dae';

// In-memory orders store (starts 100% clean, NO demo/example data)
let memoryOrders = [];

// Load persisted orders from local storage if existing
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      memoryOrders = parsed;
    }
  }
} catch (e) {
  console.warn('DB load notice:', e.message);
}

// Remote Cloud Store helpers for 100% durable cross-lambda persistence
function fetchRemoteOrders() {
  return new Promise((resolve) => {
    https.get(CLOUD_STORE_URL, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (Array.isArray(parsed?.data?.orders)) {
            return resolve(parsed.data.orders);
          }
        } catch (e) {}
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

function syncRemoteOrders(orders) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      name: 'manifesto_orders_store',
      data: { orders: (orders || []).slice(0, 500) }
    });
    const req = https.request(CLOUD_STORE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.write(data);
    req.end();
  });
}

// Helper to save order
async function saveOrder(order) {
  // Prevent duplicate insertion
  const existingIdx = memoryOrders.findIndex(o => o.id === order.id);
  if (existingIdx >= 0) {
    memoryOrders[existingIdx] = Object.assign({}, memoryOrders[existingIdx], order);
  } else {
    memoryOrders.unshift(order);
  }
  if (memoryOrders.length > 500) memoryOrders = memoryOrders.slice(0, 500);

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(memoryOrders, null, 2), 'utf-8');
  } catch (e) {}

  // Sync to remote cloud store so all serverless instances share this order immediately
  try {
    await syncRemoteOrders(memoryOrders);
  } catch (e) {}

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const url = new URL('/rest/v1/orders', SUPABASE_URL);
      const data = JSON.stringify(order);
      await new Promise((resolve) => {
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        }, () => resolve());
        req.on('error', () => resolve());
        req.write(data);
        req.end();
      });
    } catch (e) {
      console.warn('Supabase write error:', e.message);
    }
  }
  return order;
}

// Helper to get orders
async function getOrders() {
  // Always fetch latest from remote cloud store for true cross-lambda sync
  try {
    const remote = await fetchRemoteOrders();
    if (Array.isArray(remote)) {
      memoryOrders = remote.filter(o => o && o.id);
      return memoryOrders;
    }
  } catch (e) {}

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const url = new URL('/rest/v1/orders?select=*&order=createdAt.desc', SUPABASE_URL);
      const ordersFromDb = await new Promise((resolve) => {
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'GET',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY
          }
        }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      });
      if (Array.isArray(ordersFromDb) && ordersFromDb.length > 0) {
        return ordersFromDb;
      }
    } catch (e) {
      console.warn('Supabase fetch notice:', e.message);
    }
  }
  return memoryOrders;
}

// Helper to update order status
async function updateOrderStatus(orderId, updateFields) {
  let order = memoryOrders.find(o => o.id === orderId);
  if (!order) {
    const remote = await fetchRemoteOrders();
    if (Array.isArray(remote)) {
      memoryOrders = remote;
      order = memoryOrders.find(o => o.id === orderId);
    }
  }

  if (order) {
    Object.assign(order, updateFields);
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(memoryOrders, null, 2), 'utf-8');
    } catch (e) {}
    try {
      await syncRemoteOrders(memoryOrders);
    } catch (e) {}
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const url = new URL(`/rest/v1/orders?id=eq.${orderId}`, SUPABASE_URL);
      await new Promise((resolve) => {
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
          }
        }, () => resolve());
        req.on('error', () => resolve());
        req.write(JSON.stringify(updateFields));
        req.end();
      });
    } catch (e) {}
  }
  return order;
}

// Admin Token validator
function isValidAdminToken(token) {
  if (!token) return false;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const expectedToken = Buffer.from(ADMIN_PASSWORD).toString('base64');
  return clean === expectedToken || clean === ADMIN_PASSWORD;
}

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
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const reqUrl = (req.url || '/').split('?')[0];
  const isRoute = (pathStr) => reqUrl === pathStr || reqUrl.endsWith(pathStr);

  // =========================================================================
  // ADMIN ROUTES
  // =========================================================================

  // POST /api/admin/login
  if (req.method === 'POST' && (reqUrl === '/api/admin/login' || reqUrl.endsWith('/api/admin/login'))) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');
        if (password && password.trim() === ADMIN_PASSWORD) {
          const token = Buffer.from(ADMIN_PASSWORD).toString('base64');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            token,
            message: 'Autenticado com sucesso!'
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Senha de administrador incorreta.'
          }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Requisição inválida.' }));
      }
    });
    return;
  }

  // GET /api/admin/orders
  if (req.method === 'GET' && isRoute('/api/admin/orders')) {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
    if (!isValidAdminToken(authHeader)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Acesso restrito ao administrador.' }));
    }

    getOrders().then(orders => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, orders }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // PATCH /api/admin/orders
  if (req.method === 'PATCH' && isRoute('/api/admin/orders')) {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
    if (!isValidAdminToken(authHeader)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Acesso restrito ao administrador.' }));
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { orderId, ticketStatus, paymentStatus, notes } = JSON.parse(body || '{}');
        if (!orderId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ID do pedido obrigatório.' }));
        }

        const updateData = {};
        if (ticketStatus !== undefined) {
          updateData.ticketStatus = ticketStatus;
          if (ticketStatus === 'Enviado') updateData.ticketSentAt = new Date().toISOString();
        }
        if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
        if (notes !== undefined) updateData.notes = notes;

        const updated = await updateOrderStatus(orderId, updateData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, order: updated }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // =========================================================================
  // CHECKOUT ROUTES
  // =========================================================================

  // GET /api/checkout/status (Check if PIX or Card order is paid)
  if (req.method === 'GET' && (reqUrl === '/api/checkout/status' || reqUrl.startsWith('/api/checkout/status'))) {
    const parsed = new URL(req.url, 'http://localhost');
    const orderId = parsed.searchParams.get('orderId');
    getOrders().then(orders => {
      const order = (orders || []).find(o => o.id === orderId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        found: !!order,
        paymentStatus: order ? order.paymentStatus : 'Pendente',
        ticketStatus: order ? order.ticketStatus : 'Pendente'
      }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    });
    return;
  }

  // POST /api/webhook/mistic (Instant payment confirmation webhook)
  if (req.method === 'POST' && (isRoute('/api/webhook/mistic') || isRoute('/api/webhook/pix'))) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const transId = data.transactionId || data.id || data.orderId || data.data?.transactionId || data.data?.id;
        if (transId) {
          await updateOrderStatus(transId, { paymentStatus: 'Aprovado' });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      }
    });
    return;
  }

  // API Route: POST /api/checkout-card (Mercado Pago Cartão)
  if (req.method === 'POST' && isRoute('/api/checkout-card')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body || '{}');
        const {
          nome, cpf, email, telefone, endereco, amount,
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

          const newOrder = {
            id: 'mp_' + mpRes.data.id,
            createdAt: new Date().toISOString(),
            customer: {
              nome: String(nome).trim(),
              cpf: cleanCpf,
              email: String(email).trim(),
              telefone: String(telefone || '').replace(/\D/g, ''),
              endereco: String(endereco || '').trim()
            },
            itemsSummary: itemsSummary || 'Ingressos',
            amount: Number(Number(amount).toFixed(2)),
            paymentMethod: `Cartão (${brand.toUpperCase()} ${installments}x)`,
            paymentGateway: 'Mercado Pago',
            paymentStatus: status === 'approved' ? 'Aprovado' : (status === 'in_process' ? 'Em análise' : 'Recusado'),
            ticketStatus: 'Pendente'
          };
          await saveOrder(newOrder);

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

  // API Route: POST /api/checkout (PIX MisticPay)
  if (req.method === 'POST' && isRoute('/api/checkout')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body || '{}');
        const { nome, cpf, email, telefone, endereco, amount, itemsSummary } = order;

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
          description: `Manifesto Musical Brasília - ${itemsSummary || 'Ingressos'}`
        };

        const result = await createMisticTransaction(misticPayload);

        if (result.statusCode >= 200 && result.statusCode < 300 && result.data && result.data.data) {
          const newOrder = {
            id: transId,
            createdAt: new Date().toISOString(),
            customer: {
              nome: String(nome).trim(),
              cpf: cleanCpf,
              email: String(email || '').trim(),
              telefone: String(telefone || '').replace(/\D/g, ''),
              endereco: String(endereco || '').trim()
            },
            itemsSummary: itemsSummary || 'Ingressos',
            amount: Number(Number(amount).toFixed(2)),
            paymentMethod: 'PIX',
            paymentGateway: 'MisticPay',
            paymentStatus: 'Pendente',
            ticketStatus: 'Pendente',
            pixData: {
              copyPaste: result.data.data.copyPaste,
              qrcodeUrl: result.data.data.qrcodeUrl
            }
          };
          // Save order asynchronously so response is delivered instantly to customer
          saveOrder(newOrder).catch(e => console.warn('Order save notice:', e.message));

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

  // =========================================================================
  // STATIC FILE SERVING
  // =========================================================================
  let targetPath = reqUrl;
  const host = (req.headers['host'] || '').toLowerCase();
  if (host.includes('manifesto-admin') && (targetPath === '/' || targetPath === '')) {
    targetPath = '/admin.html';
  } else if (targetPath === '/' || targetPath === '') {
    targetPath = '/index.html';
  }
  if (targetPath === '/admin' || targetPath === '/admin/') targetPath = '/admin.html';

  // 1. Serve directly from in-memory cache if available (instant response & correct mime)
  if (staticCache[targetPath]) {
    const ext = path.extname(targetPath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(staticCache[targetPath]);
  }

  // 2. Try file from disk
  const cleanPath = targetPath.replace(/^\/+/, '');
  const possiblePaths = [
    path.join(__dirname, cleanPath),
    path.join(process.cwd(), cleanPath),
    path.join(__dirname, '..', cleanPath)
  ];
  const foundPath = possiblePaths.find(p => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch (e) {
      return false;
    }
  });

  if (foundPath) {
    const ext = path.extname(foundPath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(fs.readFileSync(foundPath));
  }

  // 3. Fallback to index.html ONLY for page navigation routes (no dot extension, not api)
  if (!targetPath.includes('.') && !targetPath.startsWith('/api')) {
    if (staticCache['/index.html']) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(staticCache['/index.html']);
    }
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(indexPath));
    }
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
    console.log(`Painel Admin disponível em http://localhost:${PORT}/admin`);
  });
}
