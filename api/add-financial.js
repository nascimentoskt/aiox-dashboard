module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_FIN_DB = process.env.NOTION_FIN_DB || '33af6feb-79cc-8160-b9c7-f1f74abfe0ec';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' });
  }

  try {
    const body = await parseBody(req);

    // Update path: callers send { pageId, field, value } to edit existing record.
    // Kept here so /api/update-financial (rewritten to this fn) keeps working without
    // burning a separate Vercel serverless slot.
    if (body.pageId && body.field) {
      return await handleUpdate(body, NOTION_TOKEN, res);
    }

    const { type, nome, valor, status, categoria, modelo, cnpj, vencimento, mesAno, cliente } = body;

    if (!nome || valor === undefined || valor === null) {
      return res.status(400).json({ error: 'nome and valor are required' });
    }

    const numericValor = parseFloat(valor) || 0;
    const isReceita = type === 'receita';
    const receita = isReceita ? numericValor : 0;
    const custos = isReceita ? 0 : numericValor;
    const lucro = receita - custos;

    const now = new Date();
    const mesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const defaultMesAno = mesNomes[now.getMonth()] + '/' + now.getFullYear();

    var registroNome = nome;
    if (mesAno && nome.indexOf(mesAno) < 0) {
      registroNome = nome + ' - ' + mesAno;
    }

    const properties = {
      Registro: {
        title: [{ text: { content: registroNome } }]
      },
      Cliente: {
        select: { name: cliente || 'Impulso' }
      },
      'Mes/Ano': {
        select: { name: mesAno || defaultMesAno }
      },
      Modelo: {
        select: { name: modelo || 'Fee Fixo' }
      },
      'Receita Impulso': {
        number: receita
      },
      'Custos Operacionais': {
        number: custos
      },
      Lucro: {
        number: lucro
      },
      'Status Pgto': {
        select: { name: status || 'Pendente' }
      }
    };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_FIN_DB },
        properties
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Notion API error' });
    }

    return res.status(200).json({ success: true, pageId: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

async function handleUpdate(params, token, res) {
  var pageId = params.pageId;
  var field = params.field;
  var value = params.value;
  var properties = {};

  if (field === 'receita' || field === 'valor') {
    var n1 = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
    properties['Receita Impulso'] = { number: n1 };
    properties['Lucro'] = { number: n1 };
  } else if (field === 'custos') {
    var n2 = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
    properties['Custos Operacionais'] = { number: n2 };
    properties['Lucro'] = { number: -n2 };
  } else if (field === 'status') {
    properties['Status Pgto'] = { select: { name: value } };
  } else if (field === 'nome') {
    properties['Registro'] = { title: [{ text: { content: value } }] };
  } else if (field === 'modelo') {
    properties['Modelo'] = { select: { name: value } };
  } else if (field === 'cliente') {
    properties['Cliente'] = { select: { name: value } };
  }

  var r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: properties })
  });
  if (!r.ok) {
    var err = await r.json();
    return res.status(r.status).json({ error: err.message });
  }
  return res.status(200).json({ success: true, pageId: pageId, field: field, value: value });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
