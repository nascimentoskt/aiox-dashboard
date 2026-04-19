module.exports = async function handler(req, res) {
  var NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN;
  var DB = '29288f8f-70b0-80d5-a7d9-d9c029613c21';
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_LUZZOO_TOKEN not configured' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  try {
    // Paginate to get ALL cards
    var allResults = [];
    var hasMore = true;
    var cursor = undefined;

    while (hasMore) {
      var body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      var response = await fetch('https://api.notion.com/v1/databases/' + DB + '/query', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message });

      allResults = allResults.concat(data.results);
      hasMore = data.has_more || false;
      cursor = data.next_cursor || undefined;
    }

    var cards = allResults.map(function(page) {
      var p = page.properties;
      return {
        id: page.id, title: (p['Nome da campanha'] && p['Nome da campanha'].title[0]) ? p['Nome da campanha'].title[0].text.content : 'Sem titulo',
        status: p['Status'] && p['Status'].status ? p['Status'].status.name : 'Não iniciado',
        pessoa: p['Pessoa'] && p['Pessoa'].people && p['Pessoa'].people[0] ? p['Pessoa'].people[0].name : '',
        pessoas: p['Pessoa'] && p['Pessoa'].people ? p['Pessoa'].people.map(function(x){return x.name||''}).filter(Boolean) : [],
        canal: p['Canal'] && p['Canal'].select ? p['Canal'].select.name : '',
        tipo: p['Tipo de campanha'] && p['Tipo de campanha'].multi_select ? p['Tipo de campanha'].multi_select.map(function(s){return s.name}).join(', ') : '',
        cliente: p['Cliente'] && p['Cliente'].select ? p['Cliente'].select.name : '',
        priority: p['Priority'] && p['Priority'].select ? p['Priority'].select.name : '',
        setor: p['Setor'] && p['Setor'].multi_select ? p['Setor'].multi_select.map(function(s){return s.name}).join(', ') : '',
        lastEdited: page.last_edited_time, url: page.url
      };
    });
    var statusMap = { 'Bloqueado':'bloqueado','Não iniciado':'nao-iniciado','Em planejamento':'planejamento','Em espera':'espera','Em produção':'producao','Em execução':'execucao','Concluído':'concluido' };
    var columns = [
      { id:'nao-iniciado', title:'Não Iniciado', color:'#8b8fa3', cards:[] },
      { id:'planejamento', title:'Em Planejamento', color:'#FFB300', cards:[] },
      { id:'espera', title:'Em Espera', color:'#FF9800', cards:[] },
      { id:'producao', title:'Em Produção', color:'#9C27B0', cards:[] },
      { id:'execucao', title:'Em Execução', color:'#0088FF', cards:[] },
      { id:'bloqueado', title:'Bloqueado', color:'#F44336', cards:[] },
      { id:'concluido', title:'Concluído', color:'#00C853', cards:[] }
    ];
    cards.forEach(function(card) { var colId = statusMap[card.status] || 'nao-iniciado'; var col = columns.find(function(c){return c.id===colId}); if(col) col.cards.push(card); });
    res.status(200).json({ columns: columns, totalCards: cards.length, lastSync: new Date().toISOString() });
  } catch (error) { res.status(500).json({ error: error.message }); }
};
