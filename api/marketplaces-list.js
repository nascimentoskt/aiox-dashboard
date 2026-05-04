module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  var NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN || process.env.NOTION_TOKEN;
  var DB_CAMP = process.env.NOTION_MKT_CAMPANHAS_DB || '35688f8f-70b0-816d-b29c-ee0d76fbe290';
  var DB_ADS = process.env.NOTION_MKT_ANUNCIOS_DB || '35688f8f-70b0-8102-bed0-f04e5a88ed13';

  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Notion token not configured' });

  try {
    var campanhas = await fetchAll(DB_CAMP, NOTION_TOKEN);
    var anuncios = await fetchAll(DB_ADS, NOTION_TOKEN);

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
        vendaPago: num(pr['Venda Pago']),
        vendaOrganico: num(pr['Venda Organico']),
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
        link: pr.Link && pr.Link.url ? pr.Link.url : '',
        campanhaId: pr.Campanha && pr.Campanha.relation && pr.Campanha.relation[0] ? pr.Campanha.relation[0].id : '',
        gasto: num(pr['Valor Gasto']),
        vendas: num(pr.Vendas),
        roas: num(pr.ROAS),
        ctr: num(pr.CTR),
        seo: txt(pr.SEO && pr.SEO.rich_text),
        responsavel: people(pr.Responsavel)
      };
    });

    res.status(200).json({ campanhas: campData, anuncios: adsData, lastSync: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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
