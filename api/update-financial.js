module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = '';
  await new Promise(function(resolve) {
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', resolve);
  });

  var params = JSON.parse(body);
  var pageId = params.pageId;
  var field = params.field; // 'receita', 'custos', 'status', 'nome', 'modelo', 'cnpj', 'vencimento'
  var value = params.value;

  var NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });
  if (!pageId || !field) return res.status(400).json({ error: 'pageId and field required' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    var properties = {};

    // Map field names to Notion property names and types
    if (field === 'receita' || field === 'valor') {
      var numVal = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
      properties['Receita Impulso'] = { number: numVal };
      // Recalculate lucro
      properties['Lucro'] = { number: numVal };
    } else if (field === 'custos') {
      var numVal2 = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
      properties['Custos Operacionais'] = { number: numVal2 };
      properties['Lucro'] = { number: -numVal2 };
    } else if (field === 'status') {
      properties['Status Pgto'] = { select: { name: value } };
    } else if (field === 'nome') {
      properties['Registro'] = { title: [{ text: { content: value } }] };
    } else if (field === 'modelo') {
      properties['Modelo'] = { select: { name: value } };
    } else if (field === 'cliente') {
      properties['Cliente'] = { select: { name: value } };
    }

    var updateRes = await fetch('https://api.notion.com/v1/pages/' + pageId, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: properties })
    });

    if (!updateRes.ok) {
      var err = await updateRes.json();
      return res.status(updateRes.status).json({ error: err.message });
    }

    res.status(200).json({ success: true, pageId: pageId, field: field, value: value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
