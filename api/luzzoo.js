module.exports = async function handler(req, res) {
  const NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN;
  const LUZZOO_DB = process.env.NOTION_LUZZOO_DB || '2e688f8f-70b0-8006-957b-db45457762ef';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_LUZZOO_TOKEN not configured' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${LUZZOO_DB}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message });
    }

    const cards = data.results.map(page => {
      const p = page.properties;
      return {
        id: page.id,
        title: p['Nome da campanha']?.title?.[0]?.text?.content || 'Sem titulo',
        status: p['Status']?.status?.name || 'Não iniciado',
        pessoa: p['Pessoa']?.people?.[0]?.name || '',
        canal: p['Canal']?.select?.name || '',
        tipo: p['Tipo de campanha']?.select?.name || '',
        cliente: p['Cliente']?.select?.name || '',
        priority: p['Priority']?.select?.name || '',
        setor: p['Setor']?.select?.name || '',
        descricao: p['Descrição']?.rich_text?.[0]?.text?.content || '',
        lastEdited: page.last_edited_time,
        url: page.url
      };
    });

    // Respect exact Luzzoo column structure
    const statusMap = {
      'Aprovar': 'aprovar',
      'Não iniciado': 'nao-iniciado',
      'Em planejamento': 'planejamento',
      'Em espera': 'espera',
      'Em produção': 'producao',
      'Tarefas Contínuas': 'continuas',
      'Concluído': 'concluido'
    };

    const columns = [
      { id: 'aprovar', title: 'Aprovar', color: '#F44336', cards: [] },
      { id: 'nao-iniciado', title: 'Não Iniciado', color: '#8b8fa3', cards: [] },
      { id: 'planejamento', title: 'Em Planejamento', color: '#FFB300', cards: [] },
      { id: 'espera', title: 'Em Espera', color: '#FF9800', cards: [] },
      { id: 'producao', title: 'Em Produção', color: '#9C27B0', cards: [] },
      { id: 'continuas', title: 'Tarefas Contínuas', color: '#0088FF', cards: [] },
      { id: 'concluido', title: 'Concluído', color: '#00C853', cards: [] }
    ];

    cards.forEach(card => {
      const colId = statusMap[card.status] || 'nao-iniciado';
      const col = columns.find(c => c.id === colId);
      if (col) col.cards.push(card);
    });

    res.status(200).json({
      columns,
      totalCards: cards.length,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
