module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN || process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Notion token not configured' });

  try {
    var body = await parseBody(req);
    var pageId = body.pageId;
    var field = body.field;
    var value = body.value;
    if (!pageId || !field) return res.status(400).json({ error: 'pageId and field required' });

    var properties = {};
    var numFields = ['Valor Gasto', 'Venda Pago', 'Venda Organico', 'ROAS', 'ACOS', 'CTR', 'Vendas'];
    var selFields = ['Loja', 'Marketplace', 'Status'];
    var textFields = ['SEO'];

    if (numFields.indexOf(field) >= 0) properties[field] = { number: parseFloat(value) || 0 };
    else if (selFields.indexOf(field) >= 0) properties[field] = { select: { name: value } };
    else if (textFields.indexOf(field) >= 0) properties[field] = { rich_text: [{ text: { content: value || '' } }] };
    else if (field === 'Link') properties[field] = { url: value || null };
    else if (field === 'Data') properties[field] = { date: { start: value } };
    else if (field === 'Campanha') properties[field] = { title: [{ text: { content: value || '' } }] };
    else if (field === 'Anuncio') properties[field] = { title: [{ text: { content: value || '' } }] };
    else return res.status(400).json({ error: 'Unsupported field: ' + field });

    var r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: properties })
    });
    var d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.message || 'Notion update failed' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function parseBody(req) {
  return new Promise(function(resolve, reject) {
    if (req.body) return resolve(req.body);
    var data = '';
    req.on('data', function(c) { data += c; });
    req.on('end', function() {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
