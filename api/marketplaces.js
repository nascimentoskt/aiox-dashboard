module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN || process.env.NOTION_TOKEN;
  var DB_CAMP = process.env.NOTION_MKT_CAMPANHAS_DB || '35688f8f-70b0-816d-b29c-ee0d76fbe290';
  var DB_ADS = process.env.NOTION_MKT_ANUNCIOS_DB || '35688f8f-70b0-8102-bed0-f04e5a88ed13';
  var DB_DAILY = process.env.NOTION_DAILY_DB || '35788f8f-70b0-8135-af1a-f7858d243811';
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Notion token not configured' });

  // Daily Feedback collection routes via ?type=daily or body.kind=daily
  var url = new URL(req.url, 'http://x');
  var typ = url.searchParams.get('type');
  var isDaily = typ === 'daily';
  var isExcel = typ === 'excel';

  try {
    if (req.method === 'GET' && isExcel) return await handleExcel(res, url);
    if (req.method === 'GET' && isDaily) return await handleListDaily(res, NOTION_TOKEN, DB_DAILY);
    if (req.method === 'GET') return await handleList(res, NOTION_TOKEN, DB_CAMP, DB_ADS);
    if (req.method === 'POST') return await handleAdd(req, res, NOTION_TOKEN, DB_CAMP, DB_ADS, DB_DAILY);
    if (req.method === 'PATCH') return await handleUpdate(req, res, NOTION_TOKEN);
    if (req.method === 'DELETE') return await handleDelete(req, res, NOTION_TOKEN);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

async function handleExcel(res, url) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  var sheetId = url.searchParams.get('sheetId') || '1iqGdEGWyYLUNUvGBvZXDdAaGJZ7lPAvRI2QzZsa5la4';
  var gid = url.searchParams.get('gid') || '764456387';
  var csvUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=csv&gid=' + gid;
  try {
    var r = await fetch(csvUrl, { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: 'Falha ao baixar planilha (' + r.status + '). Verifique se está compartilhada como público leitor.' });
    var csv = await r.text();
    var parsed = parseExcelCsv(csv);
    return res.status(200).json({ ok: true, rows: parsed.rows, columns: parsed.columns, lastSync: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro fetching CSV' });
  }
}

function parseExcelCsv(text) {
  // Robust CSV parse supporting quoted fields with embedded commas/newlines
  var rows = [];
  var cur = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }

  // First two rows are headers (group + metric). Forward-fill the group.
  if (rows.length < 3) return { columns: [], rows: [] };
  var groupRow = rows[0];
  var metricRow = rows[1];
  var lastGroup = '';
  var columns = [];
  var maxCols = Math.max(groupRow.length, metricRow.length);
  for (var c = 0; c < maxCols; c++) {
    var g = (groupRow[c] || '').trim();
    if (g) lastGroup = g;
    var m = (metricRow[c] || '').trim();
    columns.push({ index: c, group: c === 0 ? '' : lastGroup, metric: m, key: c === 0 ? 'data' : (lastGroup + '|' + m) });
  }

  function parseValue(s) {
    if (!s) return null;
    s = String(s).trim();
    if (!s) return null;
    if (/^R\$\s*-?[\d.,]+$/.test(s)) {
      var n = s.replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.');
      var v = parseFloat(n);
      return isNaN(v) ? null : { type: 'money', value: v, raw: s };
    }
    if (/^-?[\d.,]+%$/.test(s)) {
      var p = s.replace('%', '').replace(/\./g, '').replace(',', '.');
      var pv = parseFloat(p);
      return isNaN(pv) ? null : { type: 'percent', value: pv / 100, raw: s };
    }
    if (/^-?[\d.,]+$/.test(s)) {
      var nn = s.replace(/\./g, '').replace(',', '.');
      var v2 = parseFloat(nn);
      return isNaN(v2) ? null : { type: 'number', value: v2, raw: s };
    }
    return { type: 'text', value: s, raw: s };
  }

  var out = [];
  for (var r2 = 2; r2 < rows.length; r2++) {
    var rr = rows[r2];
    var dataCell = (rr[0] || '').trim();
    if (!dataCell || !/\d/.test(dataCell)) continue; // skip empty / footer rows
    var rec = { data: dataCell };
    for (var k = 1; k < columns.length; k++) {
      var col = columns[k];
      var val = parseValue(rr[k]);
      if (val) rec[col.key] = val;
    }
    out.push(rec);
  }
  return { columns: columns, rows: out };
}

async function handleListDaily(res, token, dbDaily) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
  var entries = await fetchAll(dbDaily, token);
  var data = entries.map(function(p) {
    var pr = p.properties;
    return {
      id: p.id,
      registro: txt(pr.Registro && pr.Registro.title),
      funcionario: sel(pr.Funcionario),
      data: pr.Data && pr.Data.date ? pr.Data.date.start : '',
      vendaMais: txt(pr.VendaMais && pr.VendaMais.rich_text),
      bloqueio: txt(pr.Bloqueio && pr.Bloqueio.rich_text),
      proximoPasso: txt(pr.ProximoPasso && pr.ProximoPasso.rich_text),
      reacoes: txt(pr.Reacoes && pr.Reacoes.rich_text)
    };
  });
  return res.status(200).json({ daily: data, lastSync: new Date().toISOString() });
}

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

async function handleAdd(req, res, token, dbCamp, dbAds, dbDaily) {
  var body = await parseBody(req);
  var kind = body.kind;
  if (kind !== 'campanha' && kind !== 'anuncio' && kind !== 'daily') return res.status(400).json({ error: 'kind must be campanha, anuncio or daily' });

  var properties = {};
  var dbId;

  if (kind === 'daily') {
    dbId = dbDaily;
    var func = body.funcionario || 'Sem nome';
    var dailyData = body.data || new Date().toISOString().slice(0, 10);
    properties = {
      Registro: { title: [{ text: { content: func + ' - ' + dailyData } }] },
      Funcionario: { select: { name: func } },
      Data: { date: { start: dailyData } },
      VendaMais: { rich_text: [{ text: { content: body.vendaMais || '' } }] },
      Bloqueio: { rich_text: [{ text: { content: body.bloqueio || '' } }] },
      ProximoPasso: { rich_text: [{ text: { content: body.proximoPasso || '' } }] }
    };
  } else if (kind === 'campanha') {
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
  var selFields = ['Loja', 'Marketplace', 'Status', 'Categoria', 'Funcionario'];
  var textFields = ['SEO', 'VendaMais', 'Bloqueio', 'ProximoPasso', 'Reacoes'];

  function buildProp(field, value) {
    if (numFields.indexOf(field) >= 0) return { number: parseFloat(value) || 0 };
    if (selFields.indexOf(field) >= 0) return value ? { select: { name: value } } : { select: null };
    if (textFields.indexOf(field) >= 0) return { rich_text: [{ text: { content: value || '' } }] };
    if (field === 'Link') return { url: value || null };
    if (field === 'Data') return { date: { start: value } };
    if (field === 'Campanha' || field === 'Anuncio' || field === 'Registro') return { title: [{ text: { content: value || '' } }] };
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
