module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN || process.env.NOTION_TOKEN;
  var DB_CAMP = process.env.NOTION_MKT_CAMPANHAS_DB || '35688f8f-70b0-816d-b29c-ee0d76fbe290';
  var DB_ADS = process.env.NOTION_MKT_ANUNCIOS_DB || '35688f8f-70b0-8102-bed0-f04e5a88ed13';
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Notion token not configured' });

  try {
    if (req.method === 'GET') return await handleList(res, NOTION_TOKEN, DB_CAMP, DB_ADS);
    if (req.method === 'POST') return await handleAdd(req, res, NOTION_TOKEN, DB_CAMP, DB_ADS);
    if (req.method === 'PATCH') return await handleUpdate(req, res, NOTION_TOKEN);
    if (req.method === 'DELETE') return await handleDelete(req, res, NOTION_TOKEN);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

async function handleList(res, token, dbCamp, dbAds) {
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  var campanhas = await fetchAll(dbCamp, token);
  var anuncios = await fetchAll(dbAds, token);

  var campData = campanhas.map(function(p) {
    var pr = p.properties;
    return {
      id: p.id,
      campanha: txt(pr.Campanha && pr.Campanha.title),
      data: pr.Data && pr.Data.date ? pr.Data.date.start : '',
      loja: sel(pr.Loja),
      marketplace: sel(pr.Marketplace),
      status: sel(pr.Status),
      gasto: num(pr['Valor Gasto']),
      vendaTotal: num(pr['Venda ADS + Organico']),
      roas: num(pr.ROAS),
      acos: num(pr.ACOS),
      ctr: num(pr.CTR),
      seo: txt(pr.SEO && pr.SEO.rich_text),
      responsavel: people(pr.Responsavel)
    };
  });

  var adsData = anuncios.map(function(p) {
    var pr = p.properties;
    return {
      id: p.id,
      anuncio: txt(pr.Anuncio && pr.Anuncio.title),
      data: pr.Data && pr.Data.date ? pr.Data.date.start : '',
      loja: sel(pr.Loja),
      marketplace: sel(pr.Marketplace),
      categoria: sel(pr.Categoria),
      link: pr.Link && pr.Link.url ? pr.Link.url : '',
      campanhaId: pr.Campanha && pr.Campanha.relation && pr.Campanha.relation[0] ? pr.Campanha.relation[0].id : '',
      gasto: num(pr['Valor Gasto']),
      vendaTotal: num(pr['Venda ADS + Organico']),
      roas: num(pr.ROAS),
      ctr: num(pr.CTR),
      seo: txt(pr.SEO && pr.SEO.rich_text),
      responsavel: people(pr.Responsavel)
    };
  });

  return res.status(200).json({ campanhas: campData, anuncios: adsData, lastSync: new Date().toISOString() });
}

async function handleAdd(req, res, token, dbCamp, dbAds) {
  var body = await parseBody(req);
  var kind = body.kind;
  if (kind !== 'campanha' && kind !== 'anuncio') return res.status(400).json({ error: 'kind must be "campanha" or "anuncio"' });

  var properties = {};
  var dbId;

  if (kind === 'campanha') {
    dbId = dbCamp;
    var gasto = parseFloat(body.gasto) || 0;
    var vTotal = parseFloat(body.vendaTotal) || 0;
    var roas = gasto > 0 ? vTotal / gasto : 0;
    var acos = vTotal > 0 ? gasto / vTotal : 0;
    var ctr = parseFloat(body.ctr) || 0;
    properties = {
      Campanha: { title: [{ text: { content: body.campanha || 'Sem nome' } }] },
      Data: { date: { start: body.data || new Date().toISOString().slice(0, 10) } },
      Loja: { select: { name: body.loja || 'Luzzoo' } },
      Marketplace: { select: { name: body.marketplace || 'Shopee' } },
      Status: { select: { name: body.status || 'Em andamento' } },
      'Valor Gasto': { number: gasto },
      'Venda ADS + Organico': { number: vTotal },
      ROAS: { number: Math.round(roas * 100) / 100 },
      ACOS: { number: Math.round(acos * 10000) / 10000 },
      CTR: { number: Math.round(ctr * 10000) / 10000 },
      SEO: { rich_text: [{ text: { content: body.seo || '' } }] }
    };
  } else {
    dbId = dbAds;
    var aGasto = parseFloat(body.gasto) || 0;
    var aVendas = parseFloat(body.vendaTotal) || 0;
    var aRoas = aGasto > 0 ? aVendas / aGasto : 0;
    var aCtr = parseFloat(body.ctr) || 0;
    properties = {
      Anuncio: { title: [{ text: { content: body.anuncio || 'Sem nome' } }] },
      Data: { date: { start: body.data || new Date().toISOString().slice(0, 10) } },
      Loja: { select: { name: body.loja || 'Luzzoo' } },
      Marketplace: { select: { name: body.marketplace || 'Shopee' } },
      'Valor Gasto': { number: aGasto },
      'Venda ADS + Organico': { number: aVendas },
      ROAS: { number: Math.round(aRoas * 100) / 100 },
      CTR: { number: Math.round(aCtr * 10000) / 10000 },
      SEO: { rich_text: [{ text: { content: body.seo || '' } }] }
    };
    if (body.categoria) properties.Categoria = { select: { name: body.categoria } };
    if (body.link) properties.Link = { url: body.link };
    if (body.campanhaId) properties.Campanha = { relation: [{ id: body.campanhaId }] };
  }

  var r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent: { database_id: dbId }, properties: properties })
  });
  var d = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: d.message || 'Notion API error' });
  return res.status(200).json({ success: true, pageId: d.id });
}

async function handleUpdate(req, res, token) {
  var body = await parseBody(req);
  var pageId = body.pageId;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });

  var numFields = ['Valor Gasto', 'Venda ADS + Organico', 'ROAS', 'ACOS', 'CTR'];
  var selFields = ['Loja', 'Marketplace', 'Status', 'Categoria'];
  var textFields = ['SEO'];

  function buildProp(field, value) {
    if (numFields.indexOf(field) >= 0) return { number: parseFloat(value) || 0 };
    if (selFields.indexOf(field) >= 0) return value ? { select: { name: value } } : { select: null };
    if (textFields.indexOf(field) >= 0) return { rich_text: [{ text: { content: value || '' } }] };
    if (field === 'Link') return { url: value || null };
    if (field === 'Data') return { date: { start: value } };
    if (field === 'Campanha' || field === 'Anuncio') return { title: [{ text: { content: value || '' } }] };
    return null;
  }

  var properties = {};
  if (body.fields && typeof body.fields === 'object') {
    var keys = Object.keys(body.fields);
    for (var i = 0; i < keys.length; i++) {
      var p = buildProp(keys[i], body.fields[keys[i]]);
      if (p) properties[keys[i]] = p;
    }
    if (Object.keys(properties).length === 0) return res.status(400).json({ error: 'No supported fields' });
  } else {
    if (!body.field) return res.status(400).json({ error: 'field or fields required' });
    var single = buildProp(body.field, body.value);
    if (!single) return res.status(400).json({ error: 'Unsupported field: ' + body.field });
    properties[body.field] = single;
  }

  var r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: properties })
  });
  var d = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: d.message || 'Notion update failed' });
  return res.status(200).json({ success: true });
}

async function handleDelete(req, res, token) {
  var body = await parseBody(req);
  var pageId = body.pageId;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });
  var r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true })
  });
  var d = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: d.message || 'Notion archive failed' });
  return res.status(200).json({ success: true });
}

async function fetchAll(dbId, token) {
  var all = [];
  var cursor;
  var hasMore = true;
  while (hasMore) {
    var body = { page_size: 100, sorts: [{ property: 'Data', direction: 'descending' }] };
    if (cursor) body.start_cursor = cursor;
    var r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Notion query failed');
    all = all.concat(d.results);
    hasMore = d.has_more || false;
    cursor = d.next_cursor;
  }
  return all;
}

function txt(arr) { return (arr && arr[0] && arr[0].text) ? arr[0].text.content : (arr && arr[0] && arr[0].plain_text) || ''; }
function sel(p) { return (p && p.select) ? p.select.name : ''; }
function num(p) { return (p && typeof p.number === 'number') ? p.number : 0; }
function people(p) { return (p && p.people && p.people[0]) ? (p.people[0].name || '') : ''; }

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
