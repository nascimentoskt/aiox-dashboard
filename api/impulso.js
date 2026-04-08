module.exports = async function handler(req, res) {
  const NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN;
  const DB = '2e288f8f-70b0-8045-8099-ff3b6abbd039';
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_LUZZOO_TOKEN not configured' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  try {
    const response = await fetch('https://api.notion.com/v1/databases/' + DB + '/query', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_size: 100 })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message });
    const cards = data.results.map(function(page) {
      var p = page.properties;
      return {
        id: page.id, title: (p['Nome da campanha'] && p['Nome da campanha'].title[0]) ? p['Nome da campanha'].title[0].text.content : 'Sem titulo',
        status: p['Status'] && p['Status'].status ? p['Status'].status.name : 'Não iniciado',
        pessoa: p['Pessoa'] && p['Pessoa'].people && p['Pessoa'].people[0] ? p['Pessoa'].people[0].name : '',
        canal: p['Canal'] && p['Canal'].select ? p['Canal'].select.name : '',
        tipo: p['Tipo de campanha'] && p['Tipo de campanha'].multi_select ? p['Tipo de campanha'].multi_select.map(function(s){return s.name}).join(', ') : '',
        cliente: p['Cliente'] && p['Cliente'].select ? p['Cliente'].select.name : '',
        projeto: p['Project'] && p['Project'].select ? p['Project'].select.name : '',
        priority: p['Priority'] && p['Priority'].select ? p['Priority'].select.name : '',
        setor: p['Setor'] && p['Setor'].multi_select ? p['Setor'].multi_select.map(function(s){return s.name}).join(', ') : '',
        lastEdited: page.last_edited_time, url: page.url
      };
    });
    var statusMap = { 'Fixo':'fixo','Não iniciado':'nao-iniciado','Aprovação':'aprovacao','Pendente':'pendente','Pronto Para Produção':'pronto','Em produção':'producao','Jobs Contínuos':'continuas','Concluído':'concluido' };
    var columns = [
      { id:'nao-iniciado', title:'Não Iniciado', color:'#8b8fa3', cards:[] },
      { id:'pendente', title:'Pendente', color:'#FF9800', cards:[] },
      { id:'pronto', title:'Pronto p/ Produção', color:'#0088FF', cards:[] },
      { id:'producao', title:'Em Produção', color:'#9C27B0', cards:[] },
      { id:'continuas', title:'Jobs Contínuos', color:'#00BCD4', cards:[] },
      { id:'fixo', title:'Fixo', color:'#607D8B', cards:[] },
      { id:'aprovacao', title:'Aprovação', color:'#F44336', cards:[] },
      { id:'concluido', title:'Concluído', color:'#00C853', cards:[] }
    ];
    cards.forEach(function(card) { var colId = statusMap[card.status] || 'nao-iniciado'; var col = columns.find(function(c){return c.id===colId}); if(col) col.cards.push(card); });
    res.status(200).json({ columns: columns, totalCards: cards.length, lastSync: new Date().toISOString() });
  } catch (error) { res.status(500).json({ error: error.message }); }
};
