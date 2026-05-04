module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN || process.env.NOTION_TOKEN;
  var DB_CAMP = process.env.NOTION_MKT_CAMPANHAS_DB || '35688f8f-70b0-816d-b29c-ee0d76fbe290';
  var DB_ADS = process.env.NOTION_MKT_ANUNCIOS_DB || '35688f8f-70b0-8102-bed0-f04e5a88ed13';

  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Notion token not configured' });

  try {
    var body = await parseBody(req);
    var kind = body.kind;

    if (kind !== 'campanha' && kind !== 'anuncio') {
      return res.status(400).json({ error: 'kind must be "campanha" or "anuncio"' });
    }

    var properties = {};
    var dbId;

    if (kind === 'campanha') {
      dbId = DB_CAMP;
      var gasto = parseFloat(body.gasto) || 0;
      var vPago = parseFloat(body.vendaPago) || 0;
      var vOrg = parseFloat(body.vendaOrganico) || 0;
      var roas = gasto > 0 ? vPago / gasto : 0;
      var acos = vPago > 0 ? gasto / vPago : 0;
      var ctr = parseFloat(body.ctr) || 0;

      properties = {
        Campanha: { title: [{ text: { content: body.campanha || 'Sem nome' } }] },
        Data: { date: { start: body.data || new Date().toISOString().slice(0, 10) } },
        Loja: { select: { name: body.loja || 'Luzzoo' } },
        Marketplace: { select: { name: body.marketplace || 'Shopee' } },
        Status: { select: { name: body.status || 'Em andamento' } },
        'Valor Gasto': { number: gasto },
        'Venda Pago': { number: vPago },
        'Venda Organico': { number: vOrg },
        ROAS: { number: Math.round(roas * 100) / 100 },
        ACOS: { number: Math.round(acos * 10000) / 10000 },
        CTR: { number: Math.round(ctr * 10000) / 10000 },
        SEO: { rich_text: [{ text: { content: body.seo || '' } }] }
      };
    } else {
      dbId = DB_ADS;
      var aGasto = parseFloat(body.gasto) || 0;
      var aVendas = parseFloat(body.vendas) || 0;
      var aRoas = aGasto > 0 ? aVendas / aGasto : 0;
      var aCtr = parseFloat(body.ctr) || 0;

      properties = {
        Anuncio: { title: [{ text: { content: body.anuncio || 'Sem nome' } }] },
        Data: { date: { start: body.data || new Date().toISOString().slice(0, 10) } },
        Loja: { select: { name: body.loja || 'Luzzoo' } },
        Marketplace: { select: { name: body.marketplace || 'Shopee' } },
        'Valor Gasto': { number: aGasto },
        Vendas: { number: aVendas },
        ROAS: { number: Math.round(aRoas * 100) / 100 },
        CTR: { number: Math.round(aCtr * 10000) / 10000 },
        SEO: { rich_text: [{ text: { content: body.seo || '' } }] }
      };
      if (body.link) properties.Link = { url: body.link };
      if (body.campanhaId) properties.Campanha = { relation: [{ id: body.campanhaId }] };
    }

    var response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: dbId }, properties: properties })
    });

    var data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion API error' });
    return res.status(200).json({ success: true, pageId: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

function parseBody(req) {
  return new Promise(function(resolve, reject) {
    if (req.body) return resolve(req.body);
    var data = '';
    req.on('data', function(chunk) { data += chunk; });
    req.on('end', function() {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
